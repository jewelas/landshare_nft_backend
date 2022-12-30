const express = require('express');
const app = express();
const cors = require('cors');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const passport = require('passport');
const config = require('./config/database');
const Web3 = require('web3');
const gameApi = require('./api/game');
require('dotenv').config();
require('./config/passport')(passport);

const gameArtifacts = require('./build/contracts/Game.json');
const houseArtifacts = require('./build/contracts/HouseNFT.json');
const helperArtifacts = require('./build/contracts/Helper.json');
const validatorArtifacts = require('./build/contracts/Validator.json');
const settingArtifacts = require('./build/contracts/Setting.json');
const CONFIG = require('./config');

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(morgan('dev'));
app.use(passport.initialize());

// Connect web3
if (typeof web3 !== 'undefined') {
	var web3 = new Web3(web3.currentProvider);
} else {
	var web3 = new Web3(new Web3.providers.HttpProvider('http://localhost:8545'));

	// testnet
	// var web3 = new Web3(new Web3.providers.HttpProvider('https://data-seed-prebsc-1-s1.binance.org:8545'));

	// mainnet
	// var web3 = new Web3(new Web3.providers.HttpProvider('https://bsc-dataseed.binance.org/'));
}

// connect db
mongoose.connect(config.database, { useNewUrlParser: true, useUnifiedTopology: true }, async (err) => {
	if (err) {
	  console.error(err);
	  process.exit();
	}

	const privateKey = process.env.PRIVATE_KEY;
	const account = await web3.eth.accounts.privateKeyToAccount('0x'+ privateKey);

	// set contract wit abi
	const gameContract = new web3.eth.Contract(gameArtifacts.abi, CONFIG.GAME_ADDRESS);
	const houseContract = new web3.eth.Contract(houseArtifacts.abi, CONFIG.HOUSE_ADDRESS);
	const helperContract = new web3.eth.Contract(helperArtifacts.abi, CONFIG.HELPER_ADDRESS);
	const validatorContract = new web3.eth.Contract(validatorArtifacts.abi, CONFIG.VALIDATOR_ADDRESS);
	const settingContract = new web3.eth.Contract(settingArtifacts.abi, CONFIG.SETTING_ADDRESS);

	// Using routes
	let authentication = require('./api/auth');
	app.use('/api', authentication);
	gameApi(app, account, gameContract, houseContract, validatorContract, settingContract, helperContract);

	app.listen(process.env.PORT || 3001, () => {
		console.log('listening on port '+ (process.env.PORT || 3001));
	});
});