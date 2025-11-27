import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { getContractReadOnly, getContractWithSigner } from "./components/useContract";
import "./App.css";
import { useAccount } from 'wagmi';
import { useFhevm, useEncrypt, useDecrypt } from '../fhevm-sdk/src';

interface BenefitSelection {
  id: string;
  name: string;
  encryptedChoice: string;
  publicValue1: number;
  publicValue2: number;
  description: string;
  creator: string;
  timestamp: number;
  isVerified?: boolean;
  decryptedValue?: number;
}

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const [loading, setLoading] = useState(true);
  const [selections, setSelections] = useState<BenefitSelection[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showSelectionModal, setShowSelectionModal] = useState(false);
  const [creatingSelection, setCreatingSelection] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ 
    visible: false, 
    status: "pending", 
    message: "" 
  });
  const [newSelectionData, setNewSelectionData] = useState({ 
    name: "", 
    choice: "", 
    description: "",
    category: "" 
  });
  const [selectedSelection, setSelectedSelection] = useState<BenefitSelection | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [contractAddress, setContractAddress] = useState("");
  const [fhevmInitializing, setFhevmInitializing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [showStats, setShowStats] = useState(false);
  const itemsPerPage = 6;

  const { initialize, isInitialized } = useFhevm();
  const { encrypt, isEncrypting } = useEncrypt();
  const { verifyDecryption, isDecrypting: fheIsDecrypting } = useDecrypt();

  const benefitOptions = [
    { id: 1, name: "Health Insurance", value: 100, category: "Insurance" },
    { id: 2, name: "Dental Coverage", value: 50, category: "Insurance" },
    { id: 3, name: "Vision Care", value: 30, category: "Insurance" },
    { id: 4, name: "Gym Membership", value: 40, category: "Wellness" },
    { id: 5, name: "Meal Vouchers", value: 60, category: "Food" },
    { id: 6, name: "Transport Allowance", value: 70, category: "Transport" }
  ];

  useEffect(() => {
    const initFhevmAfterConnection = async () => {
      if (!isConnected || isInitialized || fhevmInitializing) return;
      
      try {
        setFhevmInitializing(true);
        await initialize();
      } catch (error) {
        setTransactionStatus({ 
          visible: true, 
          status: "error", 
          message: "FHEVM initialization failed" 
        });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      } finally {
        setFhevmInitializing(false);
      }
    };

    initFhevmAfterConnection();
  }, [isConnected, isInitialized, initialize, fhevmInitializing]);

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
      const selectionsList: BenefitSelection[] = [];
      
      for (const businessId of businessIds) {
        try {
          const businessData = await contract.getBusinessData(businessId);
          selectionsList.push({
            id: businessId,
            name: businessData.name,
            encryptedChoice: businessId,
            publicValue1: Number(businessData.publicValue1) || 0,
            publicValue2: Number(businessData.publicValue2) || 0,
            description: businessData.description,
            creator: businessData.creator,
            timestamp: Number(businessData.timestamp),
            isVerified: businessData.isVerified,
            decryptedValue: Number(businessData.decryptedValue) || 0
          });
        } catch (e) {
          console.error('Error loading business data:', e);
        }
      }
      
      setSelections(selectionsList);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Failed to load data" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setIsRefreshing(false); 
    }
  };

  const createSelection = async () => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setCreatingSelection(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Creating benefit selection with FHE..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const choiceValue = parseInt(newSelectionData.choice) || 0;
      const businessId = `benefit-${Date.now()}`;
      
      const encryptedResult = await encrypt(contractAddress, address, choiceValue);
      
      const tx = await contract.createBusinessData(
        businessId,
        newSelectionData.name,
        encryptedResult.encryptedData,
        encryptedResult.proof,
        parseInt(newSelectionData.category) || 0,
        0,
        newSelectionData.description
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Waiting for transaction confirmation..." });
      await tx.wait();
      
      setTransactionStatus({ visible: true, status: "success", message: "Benefit selection created successfully!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      await loadData();
      setShowSelectionModal(false);
      setNewSelectionData({ name: "", choice: "", description: "", category: "" });
    } catch (e: any) {
      const errorMessage = e.message?.includes("user rejected transaction") 
        ? "Transaction rejected by user" 
        : "Submission failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setCreatingSelection(false); 
    }
  };

  const decryptData = async (businessId: string): Promise<number | null> => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    }
    
    setIsDecrypting(true);
    try {
      const contractRead = await getContractReadOnly();
      if (!contractRead) return null;
      
      const businessData = await contractRead.getBusinessData(businessId);
      if (businessData.isVerified) {
        const storedValue = Number(businessData.decryptedValue) || 0;
        
        setTransactionStatus({ 
          visible: true, 
          status: "success", 
          message: "Data already verified on-chain" 
        });
        setTimeout(() => {
          setTransactionStatus({ visible: false, status: "pending", message: "" });
        }, 2000);
        
        return storedValue;
      }
      
      const contractWrite = await getContractWithSigner();
      if (!contractWrite) return null;
      
      const encryptedValueHandle = await contractRead.getEncryptedValue(businessId);
      
      const result = await verifyDecryption(
        [encryptedValueHandle],
        contractAddress,
        (abiEncodedClearValues: string, decryptionProof: string) => 
          contractWrite.verifyDecryption(businessId, abiEncodedClearValues, decryptionProof)
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Verifying decryption on-chain..." });
      
      const clearValue = result.decryptionResult.clearValues[encryptedValueHandle];
      
      await loadData();
      
      setTransactionStatus({ visible: true, status: "success", message: "Data decrypted and verified successfully!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      return Number(clearValue);
      
    } catch (e: any) { 
      if (e.message?.includes("Data already verified")) {
        setTransactionStatus({ 
          visible: true, 
          status: "success", 
          message: "Data is already verified on-chain" 
        });
        setTimeout(() => {
          setTransactionStatus({ visible: false, status: "pending", message: "" });
        }, 2000);
        
        await loadData();
        return null;
      }
      
      setTransactionStatus({ 
        visible: true, 
        status: "error", 
        message: "Decryption failed: " + (e.message || "Unknown error") 
      });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    } finally { 
      setIsDecrypting(false); 
    }
  };

  const checkAvailability = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const isAvailable = await contract.isAvailable();
      setTransactionStatus({ 
        visible: true, 
        status: "success", 
        message: "FHE Benefit System is available!" 
      });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Availability check failed" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const filteredSelections = selections.filter(selection =>
    selection.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    selection.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalPages = Math.ceil(filteredSelections.length / itemsPerPage);
  const paginatedSelections = filteredSelections.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const calculateStats = () => {
    const totalSelections = selections.length;
    const verifiedSelections = selections.filter(s => s.isVerified).length;
    const totalValue = selections.reduce((sum, s) => sum + (s.decryptedValue || 0), 0);
    const avgValue = totalSelections > 0 ? totalValue / totalSelections : 0;
    
    const categoryStats: {[key: string]: number} = {};
    selections.forEach(s => {
      const category = s.publicValue1.toString();
      categoryStats[category] = (categoryStats[category] || 0) + 1;
    });

    return { totalSelections, verifiedSelections, totalValue, avgValue, categoryStats };
  };

  const stats = calculateStats();

  if (!isConnected) {
    return (
      <div className="app-container">
        <header className="app-header">
          <div className="logo">
            <h1>Benefit FHE 🎁</h1>
            <p>Private Employee Benefits Selection</p>
          </div>
          <div className="header-actions">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </header>
        
        <div className="connection-prompt">
          <div className="connection-content">
            <div className="connection-icon">🎁</div>
            <h2>Connect Your Wallet to Continue</h2>
            <p>Please connect your wallet to access the private benefits selection system.</p>
          </div>
        </div>
      </div>
    );
  }

  if (!isInitialized || fhevmInitializing) {
    return (
      <div className="loading-screen">
        <div className="fhe-spinner"></div>
        <p>Initializing FHE Encryption System...</p>
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
          <h1>Benefit FHE 🎁</h1>
          <p>Private Employee Benefits Selection</p>
        </div>
        
        <div className="header-actions">
          <button onClick={checkAvailability} className="availability-btn">
            Check System
          </button>
          <button onClick={() => setShowStats(!showStats)} className="stats-btn">
            {showStats ? "Hide Stats" : "Show Stats"}
          </button>
          <button 
            onClick={() => setShowSelectionModal(true)} 
            className="create-btn"
          >
            + Select Benefits
          </button>
          <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
        </div>
      </header>
      
      <div className="main-content">
        {showStats && (
          <div className="stats-section">
            <div className="stats-grid">
              <div className="stat-card">
                <h3>Total Selections</h3>
                <div className="stat-value">{stats.totalSelections}</div>
                <div className="stat-label">Employees Participated</div>
              </div>
              <div className="stat-card">
                <h3>Verified Choices</h3>
                <div className="stat-value">{stats.verifiedSelections}</div>
                <div className="stat-label">FHE Decrypted</div>
              </div>
              <div className="stat-card">
                <h3>Total Value</h3>
                <div className="stat-value">${stats.totalValue}</div>
                <div className="stat-label">Benefits Budget</div>
              </div>
              <div className="stat-card">
                <h3>Average per Employee</h3>
                <div className="stat-value">${stats.avgValue.toFixed(0)}</div>
                <div className="stat-label">Mean Allocation</div>
              </div>
            </div>
          </div>
        )}

        <div className="benefits-section">
          <div className="section-header">
            <h2>Employee Benefit Selections</h2>
            <div className="controls">
              <div className="search-box">
                <input
                  type="text"
                  placeholder="Search selections..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <button onClick={loadData} className="refresh-btn" disabled={isRefreshing}>
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>

          <div className="benefits-grid">
            {paginatedSelections.length === 0 ? (
              <div className="no-selections">
                <p>No benefit selections found</p>
                <button onClick={() => setShowSelectionModal(true)} className="create-btn">
                  Make First Selection
                </button>
              </div>
            ) : (
              paginatedSelections.map((selection, index) => (
                <div 
                  className={`benefit-card ${selection.isVerified ? "verified" : ""}`}
                  key={index}
                  onClick={() => setSelectedSelection(selection)}
                >
                  <div className="card-header">
                    <h3>{selection.name}</h3>
                    <span className={`status ${selection.isVerified ? "verified" : "pending"}`}>
                      {selection.isVerified ? "✅ Verified" : "🔒 Encrypted"}
                    </span>
                  </div>
                  <p className="description">{selection.description}</p>
                  <div className="card-meta">
                    <span>Category: {selection.publicValue1}</span>
                    <span>By: {selection.creator.substring(0, 6)}...{selection.creator.substring(38)}</span>
                    <span>{new Date(selection.timestamp * 1000).toLocaleDateString()}</span>
                  </div>
                  {selection.isVerified && selection.decryptedValue && (
                    <div className="decrypted-value">
                      Value: ${selection.decryptedValue}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {totalPages > 1 && (
            <div className="pagination">
              <button 
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
              >
                Previous
              </button>
              <span>Page {currentPage} of {totalPages}</span>
              <button 
                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>
      
      {showSelectionModal && (
        <div className="modal-overlay">
          <div className="selection-modal">
            <div className="modal-header">
              <h2>Select Your Benefits</h2>
              <button onClick={() => setShowSelectionModal(false)} className="close-modal">&times;</button>
            </div>
            
            <div className="modal-body">
              <div className="benefit-options">
                <h3>Available Benefits</h3>
                <div className="options-grid">
                  {benefitOptions.map(option => (
                    <div 
                      key={option.id}
                      className={`option-card ${newSelectionData.choice === option.id.toString() ? 'selected' : ''}`}
                      onClick={() => setNewSelectionData({
                        ...newSelectionData,
                        name: option.name,
                        choice: option.id.toString(),
                        category: option.category,
                        description: `${option.name} - $${option.value} value`
                      })}
                    >
                      <div className="option-icon">🎁</div>
                      <h4>{option.name}</h4>
                      <p>${option.value} value</p>
                      <span className="category">{option.category}</span>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="selection-summary">
                <h3>Your Selection</h3>
                {newSelectionData.name ? (
                  <div className="summary-card">
                    <h4>{newSelectionData.name}</h4>
                    <p>{newSelectionData.description}</p>
                    <div className="fhe-notice">
                      <strong>FHE 🔐 Protection</strong>
                      <p>Your choice will be encrypted using Zama FHE technology</p>
                    </div>
                  </div>
                ) : (
                  <p>Please select a benefit option</p>
                )}
              </div>
            </div>
            
            <div className="modal-footer">
              <button onClick={() => setShowSelectionModal(false)} className="cancel-btn">Cancel</button>
              <button 
                onClick={createSelection}
                disabled={creatingSelection || isEncrypting || !newSelectionData.name}
                className="submit-btn"
              >
                {creatingSelection || isEncrypting ? "Encrypting Selection..." : "Confirm Selection"}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {selectedSelection && (
        <div className="modal-overlay">
          <div className="detail-modal">
            <div className="modal-header">
              <h2>Benefit Selection Details</h2>
              <button onClick={() => setSelectedSelection(null)} className="close-modal">&times;</button>
            </div>
            
            <div className="modal-body">
              <div className="detail-info">
                <div className="info-row">
                  <span>Benefit:</span>
                  <strong>{selectedSelection.name}</strong>
                </div>
                <div className="info-row">
                  <span>Employee:</span>
                  <strong>{selectedSelection.creator}</strong>
                </div>
                <div className="info-row">
                  <span>Selection Date:</span>
                  <strong>{new Date(selectedSelection.timestamp * 1000).toLocaleString()}</strong>
                </div>
                <div className="info-row">
                  <span>Category:</span>
                  <strong>{selectedSelection.publicValue1}</strong>
                </div>
                <div className="info-row">
                  <span>Description:</span>
                  <p>{selectedSelection.description}</p>
                </div>
              </div>
              
              <div className="encrypted-section">
                <h3>Encrypted Benefit Value</h3>
                <div className="encrypted-status">
                  <span>Status: </span>
                  <strong>{selectedSelection.isVerified ? 
                    `✅ Verified: $${selectedSelection.decryptedValue}` : 
                    "🔒 FHE Encrypted"
                  }</strong>
                </div>
                
                <button 
                  onClick={() => decryptData(selectedSelection.id)}
                  disabled={isDecrypting || selectedSelection.isVerified}
                  className="decrypt-btn"
                >
                  {isDecrypting ? "Decrypting..." : 
                   selectedSelection.isVerified ? "Already Verified" : "Decrypt Value"}
                </button>
                
                <div className="fhe-explanation">
                  <h4>How FHE Protects Your Privacy:</h4>
                  <ul>
                    <li>Your benefit choice is encrypted on-chain</li>
                    <li>HR can only see aggregated statistics</li>
                    <li>Individual selections remain private</li>
                    <li>Decryption requires your authorization</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-toast">
          <div className={`toast-content ${transactionStatus.status}`}>
            {transactionStatus.message}
          </div>
        </div>
      )}

      <footer className="app-footer">
        <div className="footer-content">
          <p>Benefit FHE - Private Employee Benefits Selection System</p>
          <div className="footer-links">
            <span>Powered by Zama FHE Technology</span>
            <span>•</span>
            <span>Your Privacy, Our Priority</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;