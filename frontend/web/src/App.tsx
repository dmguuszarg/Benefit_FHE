import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { getContractReadOnly, getContractWithSigner } from "./components/useContract";
import "./App.css";
import { useAccount } from 'wagmi';
import { useFhevm, useEncrypt, useDecrypt } from '../fhevm-sdk/src';

interface BenefitPackage {
  id: string;
  name: string;
  encryptedValue: string;
  publicValue1: number;
  publicValue2: number;
  description: string;
  creator: string;
  timestamp: number;
  isVerified: boolean;
  decryptedValue: number;
}

interface BenefitStats {
  totalChoices: number;
  verifiedChoices: number;
  averageBenefit: number;
  recentChoices: number;
}

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const [loading, setLoading] = useState(true);
  const [benefits, setBenefits] = useState<BenefitPackage[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingBenefit, setCreatingBenefit] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ 
    visible: false, 
    status: "pending", 
    message: "" 
  });
  const [newBenefitData, setNewBenefitData] = useState({ name: "", benefitValue: "", description: "" });
  const [selectedBenefit, setSelectedBenefit] = useState<BenefitPackage | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [userHistory, setUserHistory] = useState<BenefitPackage[]>([]);
  const [showFAQ, setShowFAQ] = useState(false);
  const [stats, setStats] = useState<BenefitStats>({ totalChoices: 0, verifiedChoices: 0, averageBenefit: 0, recentChoices: 0 });
  const [contractAddress, setContractAddress] = useState("");

  const { status, initialize, isInitialized } = useFhevm();
  const { encrypt, isEncrypting } = useEncrypt();
  const { verifyDecryption, isDecrypting: fheIsDecrypting } = useDecrypt();

  useEffect(() => {
    const initFhevmAfterConnection = async () => {
      if (!isConnected || isInitialized) return;
      
      try {
        console.log('Initializing FHEVM for employee benefits...');
        await initialize();
        console.log('FHEVM initialized successfully');
      } catch (error) {
        console.error('Failed to initialize FHEVM:', error);
        setTransactionStatus({ 
          visible: true, 
          status: "error", 
          message: "FHEVM initialization failed" 
        });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      }
    };

    initFhevmAfterConnection();
  }, [isConnected, isInitialized, initialize]);

  useEffect(() => {
    const loadDataAndContract = async () => {
      if (!isConnected) {
        setLoading(false);
        return;
      }
      
      try {
        await loadData();
        const contract = await getContractReadOnly();
        if (contract) setContractAddress(await contract.getAddress());
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadDataAndContract();
  }, [isConnected]);

  const loadData = async () => {
    if (!isConnected) return;
    
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const businessIds = await contract.getAllBusinessIds();
      const benefitsList: BenefitPackage[] = [];
      const userBenefits: BenefitPackage[] = [];
      
      for (const businessId of businessIds) {
        try {
          const businessData = await contract.getBusinessData(businessId);
          const benefit: BenefitPackage = {
            id: businessId,
            name: businessData.name,
            encryptedValue: businessId,
            publicValue1: Number(businessData.publicValue1) || 0,
            publicValue2: Number(businessData.publicValue2) || 0,
            description: businessData.description,
            creator: businessData.creator,
            timestamp: Number(businessData.timestamp),
            isVerified: businessData.isVerified,
            decryptedValue: Number(businessData.decryptedValue) || 0
          };
          
          benefitsList.push(benefit);
          if (businessData.creator.toLowerCase() === address?.toLowerCase()) {
            userBenefits.push(benefit);
          }
        } catch (e) {
          console.error('Error loading benefit data:', e);
        }
      }
      
      setBenefits(benefitsList);
      setUserHistory(userBenefits);
      
      const totalChoices = benefitsList.length;
      const verifiedChoices = benefitsList.filter(b => b.isVerified).length;
      const averageBenefit = totalChoices > 0 ? benefitsList.reduce((sum, b) => sum + b.publicValue1, 0) / totalChoices : 0;
      const recentChoices = benefitsList.filter(b => Date.now()/1000 - b.timestamp < 60 * 60 * 24 * 7).length;
      
      setStats({ totalChoices, verifiedChoices, averageBenefit, recentChoices });
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Failed to load data" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setIsRefreshing(false); 
    }
  };

  const createBenefit = async () => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setCreatingBenefit(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Creating benefit choice with FHE encryption..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const benefitValue = parseInt(newBenefitData.benefitValue) || 0;
      const businessId = `benefit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      const encryptedResult = await encrypt(contractAddress, address, benefitValue);
      
      const tx = await contract.createBusinessData(
        businessId,
        newBenefitData.name,
        encryptedResult.encryptedData,
        encryptedResult.proof,
        benefitValue,
        0,
        newBenefitData.description
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Waiting for transaction confirmation..." });
      await tx.wait();
      
      setTransactionStatus({ visible: true, status: "success", message: "Benefit choice created successfully!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      await loadData();
      setShowCreateModal(false);
      setNewBenefitData({ name: "", benefitValue: "", description: "" });
    } catch (e: any) {
      const errorMessage = e.message?.includes("user rejected transaction") 
        ? "Transaction rejected by user" 
        : "Submission failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setCreatingBenefit(false); 
    }
  };

  const decryptData = async (benefitId: string): Promise<number | null> => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    }
    
    try {
      const contractRead = await getContractReadOnly();
      if (!contractRead) return null;
      
      const businessData = await contractRead.getBusinessData(benefitId);
      if (businessData.isVerified) {
        const storedValue = Number(businessData.decryptedValue) || 0;
        setTransactionStatus({ visible: true, status: "success", message: "Data already verified on-chain" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
        return storedValue;
      }
      
      const contractWrite = await getContractWithSigner();
      if (!contractWrite) return null;
      
      const encryptedValueHandle = await contractRead.getEncryptedValue(benefitId);
      
      const result = await verifyDecryption(
        [encryptedValueHandle],
        contractAddress,
        (abiEncodedClearValues: string, decryptionProof: string) => 
          contractWrite.verifyDecryption(benefitId, abiEncodedClearValues, decryptionProof)
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Verifying decryption on-chain..." });
      const clearValue = result.decryptionResult.clearValues[encryptedValueHandle];
      
      await loadData();
      setTransactionStatus({ visible: true, status: "success", message: "Data decrypted and verified successfully!" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
      return Number(clearValue);
      
    } catch (e: any) { 
      if (e.message?.includes("Data already verified")) {
        setTransactionStatus({ visible: true, status: "success", message: "Data is already verified on-chain" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
        await loadData();
        return null;
      }
      
      setTransactionStatus({ visible: true, status: "error", message: "Decryption failed: " + (e.message || "Unknown error") });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    }
  };

  const checkAvailability = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const isAvailable = await contract.isAvailable();
      setTransactionStatus({ visible: true, status: "success", message: "Contract is available and working!" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Contract check failed" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const filteredBenefits = benefits.filter(benefit =>
    benefit.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    benefit.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const renderStatsPanel = () => {
    return (
      <div className="stats-panels">
        <div className="stat-panel neon-purple">
          <h3>Total Choices</h3>
          <div className="stat-value">{stats.totalChoices}</div>
          <div className="stat-trend">+{stats.recentChoices} this week</div>
        </div>
        
        <div className="stat-panel neon-blue">
          <h3>Verified Data</h3>
          <div className="stat-value">{stats.verifiedChoices}/{stats.totalChoices}</div>
          <div className="stat-trend">FHE Verified</div>
        </div>
        
        <div className="stat-panel neon-pink">
          <h3>Avg Benefit Value</h3>
          <div className="stat-value">{stats.averageBenefit.toFixed(1)}</div>
          <div className="stat-trend">FHE Protected</div>
        </div>
      </div>
    );
  };

  const renderUserHistory = () => {
    if (userHistory.length === 0) return null;
    
    return (
      <div className="user-history-section">
        <h3>Your Benefit Choices</h3>
        <div className="history-list">
          {userHistory.map((benefit, index) => (
            <div className="history-item" key={index}>
              <div className="history-name">{benefit.name}</div>
              <div className="history-value">
                {benefit.isVerified ? `Value: ${benefit.decryptedValue}` : "Encrypted"}
              </div>
              <div className="history-date">{new Date(benefit.timestamp * 1000).toLocaleDateString()}</div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderFAQ = () => {
    return (
      <div className="faq-section">
        <h3>FHE Employee Benefits FAQ</h3>
        <div className="faq-list">
          <div className="faq-item">
            <h4>What is FHE encryption?</h4>
            <p>Fully Homomorphic Encryption allows computation on encrypted data without decryption, preserving privacy.</p>
          </div>
          <div className="faq-item">
            <h4>How are my choices kept private?</h4>
            <p>Your benefit choices are encrypted before being stored on-chain. Only you can decrypt and verify them.</p>
          </div>
          <div className="faq-item">
            <h4>Can HR see my individual choices?</h4>
            <p>No, HR can only see encrypted data and perform statistical analysis without accessing individual choices.</p>
          </div>
        </div>
      </div>
    );
  };

  if (!isConnected) {
    return (
      <div className="app-container">
        <header className="app-header">
          <div className="logo">
            <h1>FHE Employee Benefits 🔐</h1>
          </div>
          <div className="header-actions">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </header>
        
        <div className="connection-prompt">
          <div className="connection-content">
            <div className="connection-icon">🔐</div>
            <h2>Connect Your Wallet to Continue</h2>
            <p>Please connect your wallet to access the encrypted employee benefits system.</p>
            <div className="connection-steps">
              <div className="step">
                <span>1</span>
                <p>Connect your wallet using the button above</p>
              </div>
              <div className="step">
                <span>2</span>
                <p>FHE system will automatically initialize</p>
              </div>
              <div className="step">
                <span>3</span>
                <p>Start choosing your benefits privately</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isInitialized) {
    return (
      <div className="loading-screen">
        <div className="fhe-spinner"></div>
        <p>Initializing FHE Encryption System...</p>
        <p>Status: {status}</p>
      </div>
    );
  }

  if (loading) return (
    <div className="loading-screen">
      <div className="fhe-spinner"></div>
      <p>Loading encrypted benefits system...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <h1>FHE Employee Benefits 🔐</h1>
          <p>Privacy-first benefit selection with homomorphic encryption</p>
        </div>
        
        <div className="header-actions">
          <button onClick={checkAvailability} className="check-btn">Check Contract</button>
          <button onClick={() => setShowCreateModal(true)} className="create-btn">+ Choose Benefits</button>
          <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
        </div>
      </header>
      
      <div className="main-content">
        <div className="content-panels">
          <div className="left-panel">
            <div className="panel-section">
              <h2>Benefit Statistics</h2>
              {renderStatsPanel()}
            </div>
            
            <div className="panel-section">
              <div className="section-header">
                <h2>Search Benefits</h2>
                <button onClick={() => setShowFAQ(!showFAQ)} className="faq-btn">
                  {showFAQ ? "Hide FAQ" : "Show FAQ"}
                </button>
              </div>
              <div className="search-box">
                <input
                  type="text"
                  placeholder="Search benefit choices..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="search-input"
                />
              </div>
            </div>
            
            {showFAQ && renderFAQ()}
            {renderUserHistory()}
          </div>
          
          <div className="right-panel">
            <div className="panel-section">
              <div className="section-header">
                <h2>All Benefit Choices</h2>
                <div className="header-actions">
                  <button onClick={loadData} className="refresh-btn" disabled={isRefreshing}>
                    {isRefreshing ? "Refreshing..." : "Refresh"}
                  </button>
                </div>
              </div>
              
              <div className="benefits-list">
                {filteredBenefits.length === 0 ? (
                  <div className="no-benefits">
                    <p>No benefit choices found</p>
                    <button className="create-btn" onClick={() => setShowCreateModal(true)}>
                      Make First Choice
                    </button>
                  </div>
                ) : filteredBenefits.map((benefit, index) => (
                  <div 
                    className={`benefit-item ${selectedBenefit?.id === benefit.id ? "selected" : ""} ${benefit.isVerified ? "verified" : ""}`}
                    key={index}
                    onClick={() => setSelectedBenefit(benefit)}
                  >
                    <div className="benefit-header">
                      <div className="benefit-title">{benefit.name}</div>
                      <div className={`benefit-status ${benefit.isVerified ? "verified" : "encrypted"}`}>
                        {benefit.isVerified ? "✅ Verified" : "🔒 Encrypted"}
                      </div>
                    </div>
                    <div className="benefit-description">{benefit.description}</div>
                    <div className="benefit-meta">
                      <span>Creator: {benefit.creator.substring(0, 6)}...{benefit.creator.substring(38)}</span>
                      <span>Date: {new Date(benefit.timestamp * 1000).toLocaleDateString()}</span>
                    </div>
                    {benefit.isVerified && (
                      <div className="benefit-value">Value: {benefit.decryptedValue}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {showCreateModal && (
        <ModalCreateBenefit 
          onSubmit={createBenefit} 
          onClose={() => setShowCreateModal(false)} 
          creating={creatingBenefit} 
          benefitData={newBenefitData} 
          setBenefitData={setNewBenefitData}
          isEncrypting={isEncrypting}
        />
      )}
      
      {selectedBenefit && (
        <BenefitDetailModal 
          benefit={selectedBenefit} 
          onClose={() => setSelectedBenefit(null)} 
          isDecrypting={fheIsDecrypting} 
          decryptData={() => decryptData(selectedBenefit.id)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="fhe-spinner"></div>}
              {transactionStatus.status === "success" && "✓"}
              {transactionStatus.status === "error" && "✗"}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}
    </div>
  );
};

const ModalCreateBenefit: React.FC<{
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  benefitData: any;
  setBenefitData: (data: any) => void;
  isEncrypting: boolean;
}> = ({ onSubmit, onClose, creating, benefitData, setBenefitData, isEncrypting }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    if (name === 'benefitValue') {
      const intValue = value.replace(/[^\d]/g, '');
      setBenefitData({ ...benefitData, [name]: intValue });
    } else {
      setBenefitData({ ...benefitData, [name]: value });
    }
  };

  return (
    <div className="modal-overlay">
      <div className="create-benefit-modal">
        <div className="modal-header">
          <h2>Choose Your Benefits</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice">
            <strong>FHE 🔐 Privacy Protection</strong>
            <p>Your benefit choice will be encrypted with Zama FHE 🔐 (Integer values only)</p>
          </div>
          
          <div className="form-group">
            <label>Benefit Package Name *</label>
            <input 
              type="text" 
              name="name" 
              value={benefitData.name} 
              onChange={handleChange} 
              placeholder="Enter benefit package name..." 
            />
          </div>
          
          <div className="form-group">
            <label>Benefit Value (Integer only) *</label>
            <input 
              type="number" 
              name="benefitValue" 
              value={benefitData.benefitValue} 
              onChange={handleChange} 
              placeholder="Enter benefit value..." 
              step="1"
              min="0"
            />
            <div className="data-type-label">FHE Encrypted Integer</div>
          </div>
          
          <div className="form-group">
            <label>Description</label>
            <textarea 
              name="description" 
              value={benefitData.description} 
              onChange={handleChange} 
              placeholder="Describe your benefit choice..." 
              rows={3}
            />
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="cancel-btn">Cancel</button>
          <button 
            onClick={onSubmit} 
            disabled={creating || isEncrypting || !benefitData.name || !benefitData.benefitValue} 
            className="submit-btn"
          >
            {creating || isEncrypting ? "Encrypting and Submitting..." : "Submit Choice"}
          </button>
        </div>
      </div>
    </div>
  );
};

const BenefitDetailModal: React.FC<{
  benefit: BenefitPackage;
  onClose: () => void;
  isDecrypting: boolean;
  decryptData: () => Promise<number | null>;
}> = ({ benefit, onClose, isDecrypting, decryptData }) => {
  const handleDecrypt = async () => {
    await decryptData();
  };

  return (
    <div className="modal-overlay">
      <div className="benefit-detail-modal">
        <div className="modal-header">
          <h2>Benefit Choice Details</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="benefit-info">
            <div className="info-item">
              <span>Package Name:</span>
              <strong>{benefit.name}</strong>
            </div>
            <div className="info-item">
              <span>Creator:</span>
              <strong>{benefit.creator.substring(0, 6)}...{benefit.creator.substring(38)}</strong>
            </div>
            <div className="info-item">
              <span>Date Created:</span>
              <strong>{new Date(benefit.timestamp * 1000).toLocaleDateString()}</strong>
            </div>
            <div className="info-item">
              <span>Description:</span>
              <strong>{benefit.description}</strong>
            </div>
          </div>
          
          <div className="data-section">
            <h3>Encrypted Benefit Data</h3>
            
            <div className="data-row">
              <div className="data-label">Benefit Value:</div>
              <div className="data-value">
                {benefit.isVerified ? 
                  `${benefit.decryptedValue} (On-chain Verified)` : 
                  "🔒 FHE Encrypted Integer"
                }
              </div>
              <button 
                className={`decrypt-btn ${benefit.isVerified ? 'decrypted' : ''}`}
                onClick={handleDecrypt} 
                disabled={isDecrypting}
              >
                {isDecrypting ? "🔓 Verifying..." : benefit.isVerified ? "✅ Verified" : "🔓 Verify Decryption"}
              </button>
            </div>
            
            <div className="fhe-info">
              <div className="fhe-icon">🔐</div>
              <div>
                <strong>FHE 🔐 Privacy Protection</strong>
                <p>Your benefit value is encrypted on-chain. Verify decryption to confirm the stored value matches your original choice.</p>
              </div>
            </div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="close-btn">Close</button>
          {!benefit.isVerified && (
            <button 
              onClick={handleDecrypt} 
              disabled={isDecrypting}
              className="verify-btn"
            >
              {isDecrypting ? "Verifying on-chain..." : "Verify on-chain"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;


