# Employee Benefits FHE

Employee Benefits FHE is a privacy-preserving application designed to empower HR departments with secure handling of employee benefit selections. Utilizing Zama's Fully Homomorphic Encryption (FHE) technology, this solution ensures that personal choices remain confidential while still allowing for aggregate statistical insights.

## The Problem

In today’s data-driven world, employee privacy is often at risk when organizations collect and analyze sensitive information related to benefits selections. Traditional methods of processing cleartext data can expose personal preferences, leading to potential misuse or unauthorized access. The lack of privacy in these processes poses significant risks to employees, undermining their trust and willingness to participate in benefit programs. 

## The Zama FHE Solution

By leveraging Zama's FHE technology, Employee Benefits FHE enables organizations to compute on encrypted data without ever exposing the underlying information. This ensures that individual choices remain private, even as HR can perform necessary aggregate statistics on employee benefits. Using fhevm to process encrypted inputs, HR teams can efficiently manage and analyze benefit data without compromising employee confidentiality.

## Key Features

- 🔒 **Privacy Protection**: Individual employee choices are kept confidential, ensuring data integrity and trust.
- 📊 **Homomorphic Statistics**: Aggregate data can be analyzed while keeping individual selections anonymous, enabling informed decision-making.
- 🎁 **Flexible Benefits**: Employees can choose from a diverse range of benefits, all while maintaining their privacy preferences.
- 📝 **User-Friendly Interface**: An intuitive selection interface makes it easy for employees to navigate their options while ensuring their data remains secure.

## Technical Architecture & Stack

The architecture of Employee Benefits FHE is designed with security and efficiency in mind. The core components include:

- **Frontend**: User interface for employees to select benefits.
- **Backend**: Server-side logic utilizing Zama's FHE technology to process encrypted data.
- **Database**: Encrypted storage for maintaining user selections.

### Technology Stack
- Zama FHE Technology (fhevm)
- Backend Language (Node.js)
- Frontend Framework (React)
- Database (PostgreSQL)

## Smart Contract / Core Logic

Here is a simplified example of how benefit selections can be processed securely using Zama's technology:

```solidity
pragma solidity ^0.8.0;

import "TFHE.sol";

contract EmployeeBenefits {
    mapping(address => uint64) private selections;

    function submitSelection(uint64 encryptedSelection) public {
        // Store the encrypted selection for each employee
        selections[msg.sender] = encryptedSelection;
    }

    function getAggregateStatistics() public view returns (uint64) {
        uint64 total = 0;
        // Homomorphic computation to generate aggregate statistics
        for (address employee : employeeList) {
            total += TFHE.decrypt(selections[employee]);
        }
        return total;
    }
}
```

In this pseudo-code, employee selections are stored in a secure mapping, and aggregate statistics are computed without revealing individual data.

## Directory Structure

The project structure is organized as follows:

```
EmployeeBenefitsFHE/
│
├── .env                  # Environment configuration
├── src/                  # Source files
│   ├── index.js          # Entry point for the application
│   ├── benefitsSelection.sol # Smart contract for employee benefit selection
│   └── utils/            # Utility functions
│       └── encryption.js  # Functions leveraging FHE
│
├── tests/                # Test files
│   └── benefits.test.js   # Tests for the smart contract
│
├── package.json          # Project configuration file
└── README.md             # Project documentation
```

## Installation & Setup

### Prerequisites

Before you begin, ensure you have the following installed:

- Node.js
- npm (Node Package Manager)
- PostgreSQL

### Install Dependencies

To set up the project, navigate to the project directory and run the following commands to install the necessary dependencies:

```bash
npm install
npm install fhevm
```

This will install all required libraries, including the Zama FHE library necessary for the encryption processes.

## Build & Run

To build and run the application, use the following commands:

1. **Compile smart contracts**:
   ```bash
   npx hardhat compile
   ```

2. **Start the application**:
   ```bash
   node src/index.js
   ```

Once the application is running, you can interact with the employee benefits selection interface.

## Acknowledgements

This project would not be possible without the innovative work of Zama, which provides the open-source FHE primitives that enhance the security and privacy of our application. Their commitment to democratizing encryption technologies is vital in protecting sensitive data across various domains.


