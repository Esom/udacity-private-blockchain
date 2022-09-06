/**
 *                          Blockchain Class
 *  The Blockchain class contain the basics functions to create your own private blockchain
 *  It uses libraries like `crypto-js` to create the hashes for each block and `bitcoinjs-message`
 *  to verify a message signature. The chain is stored in the array
 *  `this.chain = [];`. Of course each time you run the application the chain will be empty because and array
 *  isn't a persisten storage method.
 *
 */

const SHA256 = require('crypto-js/sha256');
const BlockClass = require('./block.js');
const bitcoinMessage = require('bitcoinjs-message');

class Blockchain {

    /**
     * Constructor of the class, you will need to setup your chain array and the height
     * of your chain (the length of your chain array).
     * Also everytime you create a Blockchain class you will need to initialized the chain creating
     * the Genesis Block.
     * The methods in this class will always return a Promise to allow client applications or
     * other backends to call asynchronous functions.
     */
    constructor() {
        this.chain = [];
        this.height = -1;
        this.initializeChain();
    }

    /**
     * This method will check for the height of the chain and if there isn't a Genesis Block it will create it.
     * You should use the `addBlock(block)` to create the Genesis Block
     * Passing as a data `{data: 'Genesis Block'}`
     */
    async initializeChain() {
        if( this.height === -1){
            let block = new BlockClass.Block({data: 'Genesis Block'});
            await this._addBlock(block);
        }
    }

    /**
     * Utility method that return a Promise that will resolve with the height of the chain
     */
    getChainHeight() {
        return new Promise((resolve, reject) => {
            resolve(this.height);
        });
    }

    /**
     * Utility method for getting current UTC timestamp
     */
    getUTCTimestamp() {
        return new Date().getTime().toString().slice(0,-3);
    }

    /**
     * _addBlock(block) will store a block in the chain
     * @param {*} block
     * The method will return a Promise that will resolve with the block added
     * or reject if an error happen during the execution.
     * You will need to check for the height to assign the `previousBlockHash`,
     * assign the `timestamp` and the correct `height`...At the end you need to
     * create the `block hash` and push the block into the chain array. Don't for get
     * to update the `this.height`
     * Note: the symbol `_` in the method name indicates in the javascript convention
     * that this method is a private method.
     */
    _addBlock(block) {
        let chainErrorFound = false;

        // Checks for chain validity
        this.validateChain().then(errors => {
            errors.length ? chainErrorFound = true : chainErrorFound = false;
        });

        return new Promise(async (resolve, reject) => {
            let height = this.chain.length;
            let maxHashLength = 64;
            block.previousBlockHash = this.chain[height - 1] ? this.chain[height - 1].hash : null;
            block.height = height;
            block.time = this.getUTCTimestamp();
            block.hash = await SHA256(JSON.stringify(block)).toString();
            const isBlockValid = block.hash && block.time && (block.height === this.chain.length) && (block.hash.length === maxHashLength);
            isBlockValid ? resolve(block) : reject(new Error('Block is invalid and cannot be added'));
        })
        .catch(error => console.log('Error ', error))
        .then(block => {
            if (!chainErrorFound) {
                this.chain.push(block);
                this.height = this.chain.length - 1;
                return block;
            }
        });
    }

    /**
     * The requestMessageOwnershipVerification(address) method
     * will allow you  to request a message that you will use to
     * sign it with your Bitcoin Wallet (Electrum or Bitcoin Core)
     * This is the first step before submit your Block.
     * The method return a Promise that will resolve with the message to be signed
     * @param {*} address
     */
    requestMessageOwnershipVerification(address) {
        const timestamp = this.getUTCTimestamp();
        return new Promise((resolve) => {
            let message = `${address}:${timestamp}:starRegistry`;
            resolve(message)
        });
    }

    /**
     * The submitStar(address, message, signature, star) method
     * will allow users to register a new Block with the star object
     * into the chain. This method will resolve with the Block added or
     * reject with an error.
     * Algorithm steps:
     * 1. Get the time from the message sent as a parameter example: `parseInt(message.split(':')[1])`
     * 2. Get the current time: `let currentTime = parseInt(new Date().getTime().toString().slice(0, -3));`
     * 3. Check if the time elapsed is less than 5 minutes
     * 4. Verify the message with wallet address and signature: `bitcoinMessage.verify(message, address, signature)`
     * 5. Create the block and add it to the chain
     * 6. Resolve with the block added.
     * @param {*} address
     * @param {*} message
     * @param {*} signature
     * @param {*} star
     */
    submitStar(address, message, signature, star) {
        return new Promise(async (resolve, reject) => {
            let requestedTime = parseInt(message.split(':')[1]);
            let currentTime = parseInt(this.getUTCTimestamp());
            const elapsedTime = currentTime - requestedTime;
            const targetTime = 5 * 60;

            // Check if elapsed time is less than 5 minutes
            if (elapsedTime > targetTime) reject(new Error('Time has elapsed'));

            // Verify message
            if (!bitcoinMessage.verify(message, address, signature)) reject(new Error('Message is invalid'))

            // Create block and add to chain
            let block = new BlockClass.Block({'star': star})
            block.owner = address;

            block = await this._addBlock(block)
            resolve(block);
        });
    }

    /**
     * This method will return a Promise that will resolve with the Block
     *  with the hash passed as a parameter.
     * Search on the chain array for the block that has the hash.
     * @param {*} hash
     */
    getBlockByHash(hash) {
        let self = this;
        return new Promise((resolve, reject) => {
            const isBlockFound = this.chain.find((block) => hash === block.hash);
            if (!isBlockFound) reject(new Error('Block not found with specified hash: ' + hash));
            resolve(isBlockFound);
        });
    }

    /**
     * This method will return a Promise that will resolve with the Block object
     * with the height equal to the parameter `height`
     * @param {*} height
     */
    getBlockByHeight(height) {
        let self = this;
        return new Promise((resolve, reject) => {
            let block = self.chain.filter(block => block.height === height)[0];
            block ? resolve(block) : resolve(null);
        });
    }

    /**
     * This method will return a Promise that will resolve with an array of Stars objects existing in the chain
     * and are belongs to the owner with the wallet address passed as parameter.
     * Remember the star should be returned decoded.
     * @param {*} address
     */
    getStarsByWalletAddress (address) {
        let stars = [];

        return new Promise((resolve, reject) => {
            // Get all blocks with owner matching the address
            let blocks = this.chain.filter(block => block.owner === address);
            // Call getBData() on all the blocks to get an array of promises
            let promises = blocks.map(block => block.getBData());
            // Resolve all promises
            Promise.all(promises).then(stars => {
                // Add the owner property to each star setting to the address
                stars.map(star => star.owner = address);
                // Resolve the stars array
                resolve(stars);
            })
        });
    }

    /**
     * This method will return a Promise that will resolve with the list of errors when validating the chain.
     * Steps to validate:
     * 1. You should validate each block using `validateBlock`
     * 2. Each Block should check the with the previousBlockHash
     */
    validateChain() {
        let errorLog = [];
        return new Promise(async (resolve, reject) => {
            this.chain.forEach(async block => {
                let isBlockValid = await block.validate();
                let previousBlockHeight = block.height - 1;

                if (!isBlockValid) {
                    errorLog.push(`Block ${block.height} is not valid.`);
                    resolve(errorLog);
                }

                if (block.height > 0 && (block.previousBlockHash != this.chain[previousBlockHeight].hash)) {
                    errorLog.push(`Block ${block.height} does not link to previous Block ${previousBlockHeight}.`);
                    resolve('No errors found');
                }
            });
            resolve(errorLog);
        });
    }
}

module.exports.Blockchain = Blockchain;