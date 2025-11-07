pragma solidity ^0.8.24;

import { FHE, euint32, externalEuint32 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract EncryptedBenefits is ZamaEthereumConfig {
    struct BenefitSelection {
        euint32 encryptedChoice;
        uint256 employeeId;
        uint256 timestamp;
        bool isVerified;
    }

    mapping(uint256 => BenefitSelection) public selections;
    mapping(uint256 => bool) public hasSelected;
    mapping(uint256 => uint256) public benefitCounts;

    event BenefitSelected(uint256 indexed employeeId, euint32 encryptedChoice);
    event DecryptionVerified(uint256 indexed employeeId, uint256 choice);
    event BenefitsTallied(uint256[] counts);

    modifier onlyHR() {
        require(msg.sender == hrAddress, "Unauthorized: HR only");
        _;
    }

    address public hrAddress;

    constructor(address _hr) ZamaEthereumConfig() {
        hrAddress = _hr;
    }

    function selectBenefit(
        uint256 employeeId,
        externalEuint32 encryptedChoice,
        bytes calldata inputProof
    ) external {
        require(!hasSelected[employeeId], "Employee already selected");
        require(FHE.isInitialized(FHE.fromExternal(encryptedChoice, inputProof)), "Invalid encryption");

        selections[employeeId] = BenefitSelection({
            encryptedChoice: FHE.fromExternal(encryptedChoice, inputProof),
            employeeId: employeeId,
            timestamp: block.timestamp,
            isVerified: false
        });

        FHE.allowThis(selections[employeeId].encryptedChoice);
        FHE.makePubliclyDecryptable(selections[employeeId].encryptedChoice);

        hasSelected[employeeId] = true;
        emit BenefitSelected(employeeId, selections[employeeId].encryptedChoice);
    }

    function verifyDecryption(
        uint256 employeeId,
        bytes memory abiEncodedChoice,
        bytes memory decryptionProof
    ) external onlyHR {
        require(hasSelected[employeeId], "Employee not found");
        require(!selections[employeeId].isVerified, "Already verified");

        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.toBytes32(selections[employeeId].encryptedChoice);

        FHE.checkSignatures(cts, abiEncodedChoice, decryptionProof);

        uint256 decodedChoice = abi.decode(abiEncodedChoice, (uint256));
        selections[employeeId].isVerified = true;

        emit DecryptionVerified(employeeId, decodedChoice);
    }

    function tallyBenefits(
        uint256[] calldata employeeIds,
        bytes[] calldata abiEncodedChoices,
        bytes[] calldata decryptionProofs
    ) external onlyHR {
        for (uint256 i = 0; i < employeeIds.length; i++) {
            require(hasSelected[employeeIds[i]], "Employee not found");
            require(!selections[employeeIds[i]].isVerified, "Already verified");

            bytes32[] memory cts = new bytes32[](1);
            cts[0] = FHE.toBytes32(selections[employeeIds[i]].encryptedChoice);

            FHE.checkSignatures(cts, abiEncodedChoices[i], decryptionProofs[i]);

            uint256 decodedChoice = abi.decode(abiEncodedChoices[i], (uint256));
            benefitCounts[decodedChoice] += 1;
            selections[employeeIds[i]].isVerified = true;
        }

        uint256[] memory counts = new uint256[](benefitCounts.length);
        for (uint256 i = 0; i < counts.length; i++) {
            counts[i] = benefitCounts[i];
        }

        emit BenefitsTallied(counts);
    }

    function getSelection(uint256 employeeId) 
        external 
        view 
        returns (
            euint32 encryptedChoice, 
            uint256 timestamp, 
            bool isVerified
        ) 
    {
        require(hasSelected[employeeId], "Employee not found");
        BenefitSelection storage selection = selections[employeeId];
        return (selection.encryptedChoice, selection.timestamp, selection.isVerified);
    }

    function getBenefitCount(uint256 benefitId) external view returns (uint256) {
        return benefitCounts[benefitId];
    }

    function getAllBenefitCounts() external view returns (uint256[] memory) {
        uint256[] memory counts = new uint256[](benefitCounts.length);
        for (uint256 i = 0; i < counts.length; i++) {
            counts[i] = benefitCounts[i];
        }
        return counts;
    }

    function updateHRAddress(address newHR) external onlyHR {
        hrAddress = newHR;
    }
}


