const express = require('express');
const router = express.Router();
const passport = require('passport');
const lsHelpers = require('../helpers/lsHelpers');
require('dotenv').config();

function gameApi(app, account, gameContract, houseContract, validatorContract, settingContract, helperContract) {
    router.get('/getResource', async (req, res) => {
        const tokenId = req.body.tokenId;
        const user = req.user.username;
        const resource = await lsHelpers.getResource(gameContract, user, tokenId);

        return res.status(400).json({"status": "success", "reason": resource});
    });

    router.get('/getHouse', async (req, res) => {
        const tokenId = req.body.tokenId;
        const house = await houseContract.methods.getHouse(tokenId).call();

        return res.status(400).json({"status": "success", "reason": house});
    });

    router.get('/getHouseDetails', async (req, res) => {
        const tokenId = req.body.tokenId;
        const house = await helperContract.methods.getHouseDetails(tokenId).call();

        return res.status(400).json({"status": "success", "reason": house});
    });

    router.post('/activateHouse', async (req, res) => {
        const tokenId = req.body.tokenId;
        const user = req.user.username;
        const data = await houseContract.methods.getOwnerAndStatus(tokenId).call();

        if (data[0].toLowerCase() != user.toLowerCase()) {
            return res.status(400).json({"status": "Failed", "reason": "Activate permission denied"});
        }
        if (data[1] == true) {
            return res.status(400).json({"status": "Failed", "reason": "Already activated"});
        }
        if (data[2] != 0) {
            return res.status(400).json({"status": "Failed", "reason": "House is Dead"});
        }

        const resource = await lsHelpers.getResource(gameContract, user, tokenId);

        await gameContract.methods
        .activateHouse(user, tokenId, resource[0])
        .send({ 
            from: account.address,
            gas: Number(process.env.GAS),
            })
        .on("receipt", async (receipt) => {
            const maxPowerLimit = await houseContract.methods.calculateMaxPowerLimitByUser(tokenId).call();
            return res.status(200).json({
                "status": "success", 
                "maxPowerLimit": maxPowerLimit,
                "reason": "House activated!"
            });
        })
        .on("error", (error, receipt) => {
            return res.status(400).json({"status": "error", "reason": error});
        });

    });

    router.post('/buyAddon', async (req, res) => {
        const tokenId = req.body.tokenId;
        const addonId = req.body.addonId;
        const user = req.user.username;
        let validateBuyAddon = false;
        let isValidAddonId = false;

        if (Number(addonId) >= 0 && Number(addonId) < 12) {
           isValidAddonId = true; 
        }
        if (!isValidAddonId) {
            return res.status(400).json({"status": "Failed", "reason": "Invalid addon id"});
        }

        try {
            validateBuyAddon = await validatorContract.methods.canBuyAddon(tokenId, addonId, user).call();
        } catch(error) {
            console.error(error);
            return res.status(400).json({"status": "error", "reason": error});
        }

        if (validateBuyAddon == false) {
            return res.status(400).json({"status": "Failed", "reason": "Buy Addon validation failed!"});
        }

        const addonCost = await settingContract.methods.getBaseAddonCostById(addonId).call();

        let resource = await lsHelpers.getResource(gameContract, user, tokenId);

        try {
            await gameContract.methods
            .buyAddon(user, tokenId, addonId, addonCost, resource[0])
            .send({
                from: account.address,
                gas: Number(process.env.GAS),
            })
            .on("receipt", async (receipt) => {
                resource = await lsHelpers.getResource(gameContract, user, tokenId);
                const houseNft = await lsHelpers.getHouse(houseContract, tokenId);
                const houseDetails = await helperContract.methods.getHouseDetails(tokenId).call();
                const salvageAddonData = await houseContract.methods.getAddonSalvageCost(tokenId, addonId).call();

                return res.status(200).json({
                    "status": "success", 
                    "reason": "Addon bought successfully!",
                    "resource": resource,
                    "hasAddon": houseNft[21],
                    "expireGardenTime": houseNft[8],
                    "multiplier": houseDetails[2],
                    "salvageAddonData": salvageAddonData
                });
            })
        } catch (error) {
            console.error(error)
            return res.status(400).json({"status": "error", "reason": error});
        }
    });

    router.post('/salvageAddon', async (req, res) => {
        const tokenId = req.body.tokenId;
        const addonId = req.body.addonId;
        const user = req.user.username;
        let validateSalavgeAddon = false;
        let isValidAddonId = false;

        if (Number(addonId) >= 0 && Number(addonId) < 12) {
           isValidAddonId = true; 
        }
        if (!isValidAddonId) {
            return res.status(400).json({"status": "Failed", "reason": "Invalid addon id"});
        }

        try {
            validateSalavgeAddon = await validatorContract.methods.canSalvageAddon(tokenId, addonId, user).call();
        } catch(error) {
            console.error(error);
        }
        

        if (validateSalavgeAddon == false) {
            return res.status(400).json({"status": "Failed", "reason": "Salvage Addon validation failed!"});
        }

        let resource = await lsHelpers.getResource(gameContract, user, tokenId);
        const hasAddon = await houseContract.methods.getHasAddons(tokenId).call();
        const salvageCostData = await settingContract.methods.getSalvageCost(addonId, hasAddon).call(); // 0 -> salvageCost, 1 -> sellCost

        try {
            await gameContract.methods
            .salvageAddon(user, tokenId, addonId, salvageCostData[0], salvageCostData[1], resource[0])
            .send({
                from: account.address,
                gas: Number(process.env.GAS),
            })
            .on("receipt", async (receipt) => {
                resource = await lsHelpers.getResource(gameContract, user, tokenId);
                const houseNft = await lsHelpers.getHouse(houseContract, tokenId);
                const houseDetails = await helperContract.methods.getHouseDetails(tokenId).call();

                return res.status(200).json({
                    "status": "success", 
                    "reason": "Addon salvaged successfully!",
                    "resource": resource,
                    "hasAddon": houseNft[21],
                    "multiplier": houseDetails[2]
                });
            })
        } catch (error) {
            console.error(error);
            return res.status(400).json({"status": "error", "reason": error});
        }
    });

    router.post('/fertilizeGarden', async (req, res) => {
        const tokenId = req.body.tokenId;
        const user = req.user.username;
        let validateFertilizeGarden = false;

        try {
            validateFertilizeGarden = await validatorContract.methods.canFertilizeGarden(tokenId, user).call();
        } catch(error) {
            console.error(error);
        }

        if (!validateFertilizeGarden) {
            return res.status(400).json({"status": "Failed", "reason": "Fertilize Garden validation failed!"});
        }

        let resource = await lsHelpers.getResource(gameContract, user, tokenId);
        const cost = await settingContract.methods.getFertilizeGardenCost().call();

        try {
            await gameContract.methods
            .fertilizeGarden(user, tokenId, cost, resource[0])
            .send({
                from: account.address,
                gas: Number(process.env.GAS),
            })
            .on("receipt", async (receipt) => {
                resource = await lsHelpers.getResource(gameContract, user, tokenId);
                const houseNft = await lsHelpers.getHouse(houseContract, tokenId);

                return res.status(200).json({
                    "status": "success", 
                    "reason": "Garden fertilized successfully!",
                    "resource": resource,
                    "lastFertilizedGardenTime": houseNft[9]
                });
            })
        } catch (error) {
            console.error(error);
            return res.status(400).json({"status": "error", "reason": error});
        }
    });

    router.post('/buyToolshed', async (req, res) => {
        const tokenId = req.body.tokenId;
        const toolshedType = req.body.toolshedType;
        const user = req.user.username;
        let buyToolshedValidation = false;

        try {
            buyToolshedValidation = await validatorContract.methods.canBuyToolshed(tokenId, toolshedType, user).call();
        } catch(error) {
            console.error(error);
        }

        if (!buyToolshedValidation) {
            return res.status(400).json({"status": "Failed", "reason": "Buy Toolshed validation failed!"});
        }

        let resource = await lsHelpers.getResource(gameContract, user, tokenId);
        const cost = await settingContract.methods.getToolshedBuildCost(toolshedType).call();

        try {
            await gameContract.methods
            .buyToolshed(user, tokenId, toolshedType, cost, resource[0])
            .send({
                from: account.address,
                gas: Number(process.env.GAS),
            })
            .on("receipt", async (receipt) => {
                resource = await lsHelpers.getResource(gameContract, user, tokenId);
                return res.status(200).json({
                    "status": "success", 
                    "resource": resource,
                    "reason": "Toolshed bought successfully!"
                });
            })
        } catch (error) {
            console.error(error);
            return res.status(400).json({"status": "error", "reason": error});
        }
    });

    router.post('/switchToolshed', async (req, res) => {
        const tokenId = req.body.tokenId;
        const toolshedType = req.body.toolshedType;
        const user = req.user.username;
        let validationData;

        try {
            validationData = await validatorContract.methods.canSwitchToolshed(tokenId, toolshedType, user).call();
        } catch(error) {
            console.error(error);
        }

        if (!validationData[0]) {
            return res.status(400).json({"status": "Failed", "reason": "Switch Toolshed validation failed!"});
        }

        let resource = await lsHelpers.getResource(gameContract, user, tokenId);
        const cost = await settingContract.methods.getToolshedSwitchCost().call();

        try {
            await gameContract.methods
            .switchToolshed(user, tokenId, toolshedType, validationData[1], cost, resource[0])
            .send({
                from: account.address,
                gas: Number(process.env.GAS),
            })
            .on("receipt", async (receipt) => {
                resource = await lsHelpers.getResource(gameContract, user, tokenId);
                return res.status(200).json({
                    "status": "success", 
                    "resource": resource,
                    "reason": "Toolshed switched successfully!"
                });
            })
        } catch (error) {
            console.error(error);
            return res.status(400).json({"status": "error", "reason": error});
        }
    });

    router.post('/buyFireplace', async (req, res) => {
        const tokenId = req.body.tokenId;
        const user = req.user.username;
        let validateBuyFireplace = false;

        try {
            validateBuyFireplace = await validatorContract.methods.canBuyFireplace(tokenId, user).call();
        } catch(error) {
            console.error(error);
        }

        if (!validateBuyFireplace) {
            return res.status(400).json({"status": "Failed", "reason": "Buy Fireplace validation failed!"});
        }

        let resource = await lsHelpers.getResource(gameContract, user, tokenId);
        const cost = await settingContract.methods.getFireplaceCost().call();

        try {
            await gameContract.methods
            .buyFireplace(user, tokenId, cost, resource[0])
            .send({
                from: account.address,
                gas: Number(process.env.GAS),
            })
            .on("receipt", async (receipt) => {
                resource = await lsHelpers.getResource(gameContract, user, tokenId);
                return res.status(200).json({
                    "status": "success", 
                    "resource": resource,
                    "reason": "Fireplace bought successfully!"
                });
            })
        } catch (error) {
            console.error(error);
            return res.status(400).json({"status": "error", "reason": error});
        }
    });

    router.post('/burnLumberToMakePower', async (req, res) => {
        const tokenId = req.body.tokenId;
        const lumber = req.body.lumber;
        const user = req.user.username;
        let validationData = [false, 0];

        let resource = await lsHelpers.getResource(gameContract, user, tokenId);

        try {
            validationData = await validatorContract.methods.canBurnLumber(tokenId, lumber, resource[1], resource[0], user).call();
        } catch(error) {
            console.error(error);
        }

        if (!validationData[0]) { 
            return res.status(400).json({"status": "Failed", "reason": "Burn Lumber validation failed!"});
        }

        try {
            await gameContract.methods
            .burnLumberToMakePower(user, tokenId, lumber, validationData[1], resource[0])
            .send({
                from: account.address,
                gas: Number(process.env.GAS),
            })
            .on("receipt", async (receipt) => {
                resource = await lsHelpers.getResource(gameContract, user, tokenId);
                return res.status(200).json({
                    "status": "success", 
                    "resource": resource,
                    "reason": "Burn lumber to generate power successfully!"
                });
            })
        } catch (error) {
            console.error(error);
            return res.status(400).json({"status": "error", "reason": error});
        }
    });

    router.post('/buyHarvester', async (req, res) => {
        const tokenId = req.body.tokenId;
        const user = req.user.username;
        let validateBuyHarvester = false;

        try {
            validateBuyHarvester = await validatorContract.methods.canBuyHarvester(tokenId, user).call();
        } catch(error) {
            console.error(error);
        }

        if (!validateBuyHarvester) {
            return res.status(400).json({"status": "Failed", "reason": "Buy Harvester validation failed!"});
        }

        let resource = await lsHelpers.getResource(gameContract, user, tokenId);
        const cost = await settingContract.methods.getHarvesterCost().call();

        try {
            await gameContract.methods
            .buyHarvester(user, tokenId, cost, resource[0])
            .send({
                from: account.address,
                gas: Number(process.env.GAS),
            })
            .on("receipt", async (receipt) => {
                resource = await lsHelpers.getResource(gameContract, user, tokenId);
                return res.status(200).json({
                    "status": "success", 
                    "resource": resource,
                    "reason": "Harvester bought successfully!"
                });
            })
        } catch (error) {
            console.error(error);
            return res.status(400).json({"status": "error", "reason": error});
        }
    });

    router.post('/buyConcreteFoundation', async (req, res) => {
        const tokenId = req.body.tokenId;
        const user = req.user.username;
        let validateConcreteFoundation = false;

        try {
            validateConcreteFoundation = await validatorContract.methods.canBuyConcreteFoundation(tokenId, user).call();
        } catch(error) {
            console.error(error);
        }

        if (!validateConcreteFoundation) {
            return res.status(400).json({"status": "Failed", "reason": "Buy Concrete Foundation validation failed!"});
        }

        let resource = await lsHelpers.getResource(gameContract, user, tokenId);
        const cost = await settingContract.methods.getDurabilityDiscountCost().call();

        try {
            await gameContract.methods
            .buyConcreteFoundation(user, tokenId, cost, resource[0])
            .send({
                from: account.address,
                gas: Number(process.env.GAS),
            })
            .on("receipt", async (receipt) => {
                resource = await lsHelpers.getResource(gameContract, user, tokenId);
                return res.status(200).json({
                    "status": "success", 
                    "resource": resource,
                    "reason": "Concrete Foundation bought successfully!"
                });
            })
        } catch (error) {
            console.error(error);
            return res.status(400).json({"status": "error", "reason": error});
        }
    });

    router.post('/buyTokenOverdrive', async (req, res) => {
        const tokenId = req.body.tokenId;
        const user = req.user.username;
        let validateTokenOverdrive = false;

        try {
            validateTokenOverdrive = await validatorContract.methods.canBuyTokenOverdrive(tokenId, user).call();
        } catch(error) {
            console.error(error);
        }

        if (!validateTokenOverdrive) {
            return res.status(400).json({"status": "Failed", "reason": "Buy tokenOverdrive validation failed!"});
        }

        let resource = await lsHelpers.getResource(gameContract, user, tokenId);

        try {
            await gameContract.methods
            .buyTokenOverdrive(user, tokenId, resource[0])
            .send({
                from: account.address,
                gas: Number(process.env.GAS),
            })
            .on("receipt", async (receipt) => {
                resource = await lsHelpers.getResource(gameContract, user, tokenId);
                const houseNft = await lsHelpers.getHouse(houseContract, tokenId);

                return res.status(200).json({
                    "status": "success", 
                    "reason": "TokenOverdrive bought successfully!",
                    "resource": resource,
                    "hasBoost": houseNft[25]
                });
            })
        } catch (error) {
            console.error(error);
            return res.status(400).json({"status": "error", "reason": error});
        }
    });

    router.post('/buyResourceOverdrive', async (req, res) => {
        const tokenId = req.body.tokenId;
        const facilityType = req.body.facilityType;
        const user = req.user.username;
        let validateResourceOverdrive = false;

        try {
            validateResourceOverdrive = await validatorContract.methods.canBuyResourceOverdrive(tokenId, facilityType, user).call();
        } catch(error) {
            console.error(error);
        }

        if (!validateResourceOverdrive) {
            return res.status(400).json({"status": "Failed", "reason": "Buy ResourceOverdrive validation failed!"});
        }

        let resource = await lsHelpers.getResource(gameContract, user, tokenId);

        try {
            await gameContract.methods
            .buyResourceOverdrive(user, tokenId, facilityType, resource[0])
            .send({
                from: account.address,
                gas: Number(process.env.GAS),
            })
            .on("receipt", async (receipt) => {
                resource = await lsHelpers.getResource(gameContract, user, tokenId);
                const houseNft = await lsHelpers.getHouse(houseContract, tokenId);

                return res.status(200).json({
                    "status": "success", 
                    "reason": "ResourceOverdrive bought successfully!",
                    "resource": resource,
                    "hasBoost": houseNft[25]
                });
            })
        } catch (error) {
            console.error(error);
            return res.status(400).json({"status": "error", "reason": error});
        }
    });

    router.post('/frontLoadFirepit', async (req, res) => {
        const tokenId = req.body.tokenId;
        const lumber = req.body.lumber;
        const user = req.user.username;
        let validateFrontLoad = false;

        try {
            validateFrontLoad = await validatorContract.methods.canFrontloadFirepit(tokenId, lumber, user).call();
        } catch(error) {
            console.error(error);
        }

        if (!validateFrontLoad) {
            return res.status(400).json({"status": "Failed", "reason": "Frontload Firepit validation failed!"});
        }

        let resource = await lsHelpers.getResource(gameContract, user, tokenId);

        try {
            await gameContract.methods
            .frontLoadFirepit(user, tokenId, lumber, resource[0])
            .send({
                from: account.address,
                gas: Number(process.env.GAS),
            })
            .on("receipt", async (receipt) => {
                resource = await lsHelpers.getResource(gameContract, user, tokenId);
                const firepitDays = await houseContract.methods.getFirepitRemainDays(tokenId).call();

                return res.status(200).json({
                    "status": "success", 
                    "reason": "Firepit frontlaod successfully!",
                    "resource": resource,
                    "firepitDays": firepitDays
                });
            })
        } catch (error) {
            console.error(error);
            return res.status(400).json({"status": "error", "reason": error});
        }
    });

    router.post('/gatherLumberWithPower', async (req, res) => {
        const tokenId = req.body.tokenId;
        const lumber = req.body.lumber;
        const user = req.user.username;
        let validateGatherLumber = false;

        const gatherLumberTime = await gameContract.methods.getLastGatherLumberTime(user).call();
        try {
            validateGatherLumber = await validatorContract.methods.canGatherLumberWithPower(tokenId, lumber, gatherLumberTime, user).call();
        } catch(error) {
            console.error(error);
        }

        if (!validateGatherLumber) {
            return res.status(400).json({"status": "Failed", "reason": "Gather lumber with power validation failed!"});
        }

        let resource = await lsHelpers.getResource(gameContract, user, tokenId);

        try {
            await gameContract.methods
            .gatherLumberWithPower(user, tokenId, lumber, resource[0])
            .send({
                from: account.address,
                gas: Number(process.env.GAS),
            })
            .on("receipt", async (receipt) => {
                resource = await lsHelpers.getResource(gameContract, user, tokenId);
                return res.status(200).json({
                    "status": "success", 
                    "reason": "Gathered Lumber with power successfully!",
                    "resource": resource
                });
            })
        } catch (error) {
            console.error(error);
            return res.status(400).json({"status": "error", "reason": error});
        }
    });

    router.post('/upgradeFacility', async (req, res) => {
        const tokenId = req.body.tokenId;
        const facilityType = req.body.facilityType;
        const user = req.user.username;
        let validateUpgradeFacility = false;

        try {
            validateUpgradeFacility = await validatorContract.methods.canUpgradeFacility(tokenId, facilityType, user).call();
        } catch(error) {
            console.error(error);
        }

        if (!validateUpgradeFacility) {
            return res.status(400).json({"status": "Failed", "reason": "Upgrade facility validation failed!"});
        }

        let resource = await lsHelpers.getResource(gameContract, user, tokenId);
        const facilityLevel = await houseContract.methods.getFacilityLevel(tokenId, facilityType).call();
        const cost = await settingContract.methods.getFacilityUpgradeCost(facilityType, Number(facilityLevel) + 1).call();

        try {
            await gameContract.methods
            .upgradeFacility(user, tokenId, facilityType, cost, facilityLevel, resource[0])
            .send({
                from: account.address,
                gas: Number(process.env.GAS),
            })
            .on("receipt", async (receipt) => {
                resource = await lsHelpers.getResource(gameContract, user, tokenId);
                return res.status(200).json({"status": "success", "reason": "Facility upgraded successfully!", "resource": resource});
            })
        } catch (error) {
            console.error(error);
            return res.status(400).json({"status": "error", "reason": error});
        }
    });

    router.post('/fortify', async (req, res) => {
        const tokenId = req.body.tokenId;
        const type = req.body.type;
        const user = req.user.username;

        const data = await houseContract.methods.getOwnerAndStatus(tokenId).call();

        if (data[0].toLowerCase() != user.toLowerCase()) {
            return res.status(400).json({"status": "Failed", "reason": "Fortify permission denied"});
        }
        if (data[1] == false) {
            return res.status(400).json({"status": "Failed", "reason": "Activation required"});
        }
        if (data[2] != 0) {
            return res.status(400).json({"status": "Failed", "reason": "House is Dead"});
        }

        let isValidFortifyType = false;
        if (Number(type) < 3) {
            isValidFortifyType = true;
        }
        if (!isValidFortifyType) {
            return res.status(400).json({"status": "Failed", "reason": "Invalid fortification type"});
        }

        let resource = await lsHelpers.getResource(gameContract, user, tokenId);
        const cost = await settingContract.methods.getFortifyCost(type).call();

        try {
            await gameContract.methods
            .fortify(user, tokenId, type, cost, resource[0])
            .send({
                from: account.address,
                gas: Number(process.env.GAS),
            })
            .on("receipt", async (receipt) => {
                const {
                    blockNumber,
                    events: {
                      UpdateResource: {
                        returnValues: { updatedResource: resource },
                      },
                    },
                  } = receipt;
                return res.status(200).json({
                    "status": "success", 
                    "reason": "Fortified successfully!", 
                    "resource": resource,
                    "blockNumber": blockNumber
                });
            })
        } catch (error) {
            console.error(error);
            return res.status(400).json({"status": "error", "reason": error});
        }
    });

    router.post('/repair', async (req, res) => {
        const tokenId = req.body.tokenId;
        const percent = req.body.percent;
        const user = req.user.username;

        const data = await houseContract.methods.getOwnerAndStatus(tokenId).call();

        if (data[0].toLowerCase() != user.toLowerCase()) {
            return res.status(400).json({"status": "Failed", "reason": "Repair permission denied"});
        }
        if (data[1] == false) {
            return res.status(400).json({"status": "Failed", "reason": "Activation required"});
        }
        if (data[2] != 0) {
            return res.status(400).json({"status": "Failed", "reason": "House is Dead"});
        }

        let isValidPercent = false;
        if (Number(percent) > 0) {
            isValidPercent = true;
        }
        if (!isValidPercent) {
            return res.status(400).json({"status": "Failed", "reason": "Percent should above 0"});
        }

        let resource = await lsHelpers.getResource(gameContract, user, tokenId);
        const repairData = await helperContract.methods.getRepairData(tokenId, percent).call();

        // 0 -> maxDurability, 1 -> curDurability, 2 -> repairCost
        if (Number(repairData[1]) + Number(percent) > Number(repairData[0])) {
            return res.status(400).json({"status": "Failed", "reason": "Overflow maximium durability"});
        }
        if (Number(repairData[0]) - Number(repairData[1]) >= 10 * Number(process.env.PRECISION)) {
            if (Number(percent) < 10 * Number(process.env.PRECISION)) {
                return res.status(400).json({"status": "Failed", "reason": "Should repair at least 10%"});
            }   
        } else if(Number(repairData[1]) + Number(percent) != Number(repairData[0])) {
            return res.status(400).json({"status": "Failed", "reason": "Should repair to max durability"});
        }

        try {
            await gameContract.methods
            .repair(user, tokenId, percent, repairData[1], repairData[2], resource[0])
            .send({
                from: account.address,
                gas: Number(process.env.GAS),
            })
            .on("receipt", async (receipt) => {
                resource = await lsHelpers.getResource(gameContract, user, tokenId);
                return res.status(200).json({
                    "status": "success", 
                    "reason": "Repaired successfully!",
                    "resource": resource
                });
            })
        } catch (error) {
            console.error(error);
            return res.status(400).json({"status": "error", "reason": error});
        }
    });

    router.post('/harvest', async (req, res) => {
        const tokenId = req.body.tokenId;
        const harvestingReward = req.body.harvestingReward;
        const user = req.user.username;
        let validateHarvest = [false, 0, 0];

        try {
            validateHarvest = await validatorContract.methods.canHarvest(tokenId, harvestingReward, user).call();
        } catch(error) {
            console.error(error);
        }

        if (!validateHarvest[0]) {
            return res.status(400).json({"status": "Failed", "reason": "Harvest validation failed!"});
        }

        let resource = await lsHelpers.getResource(gameContract, user, tokenId);
        const powerCost = await helperContract.methods.getHarvestCost(tokenId, harvestingReward).call();
        const resourceReward = await houseContract.methods.getResourceReward(tokenId).call();

        try {
            await gameContract.methods
            .harvest(user, tokenId, harvestingReward, resourceReward, validateHarvest[1], validateHarvest[2], powerCost, resource[0])
            .send({
                from: account.address,
                gas: Number(process.env.GAS),
            })
            .on("receipt", async (receipt) => {
                resource = await lsHelpers.getResource(gameContract, user, tokenId);
                return res.status(200).json({
                    "status": "success", 
                    "reason": "Harvested successfully!",
                    "resource": resource
                });
            })
        } catch (error) {
            console.error(error);
            return res.status(400).json({"status": "error", "reason": error});
        }
    });

    router.post('/onSale', async (req, res) => {
        const tokenId = req.body.tokenId;
        const price = req.body.price;
        const user = req.user.username;

        const data = await houseContract.methods.getOwnerAndStatus(tokenId).call();

        if (data[0].toLowerCase() != user.toLowerCase()) {
            return res.status(400).json({"status": "Failed", "reason": "OnSale permission denied"});
        }
        if (data[1] == false) {
            return res.status(400).json({"status": "Failed", "reason": "Activation required"});
        }
        if (data[2] != 0) {
            return res.status(400).json({"status": "Failed", "reason": "House is Dead"});
        }

        const depositBalance = await houseContract.methods.getDepositedBalance(tokenId).call();
        const tokenReward = await houseContract.methods.getTokenReward(tokenId).call();

        if (depositBalance != 0) {
            return res.status(400).json({"status": "Failed", "reason": "Shoud unstake all"});
        }
        if (tokenReward != 0) {
            return res.status(400).json({"status": "Failed", "reason": "Shoud harvest all tokens"});
        }

        try {
            await gameContract.methods
            .onSale(user, tokenId, price)
            .send({
                from: account.address,
                gas: Number(process.env.GAS),
            })
            .on("receipt", async (receipt) => {
                return res.status(200).json({"status": "success", "reason": "OnSale successfully!"});
            })
        } catch (error) {
            console.error(error);
            return res.status(400).json({"status": "error", "reason": error});
        }
    });

    router.post('/offSale', async (req, res) => {
        const tokenId = req.body.tokenId;
        const user = req.user.username;

        const data = await houseContract.methods.getOwnerAndStatus(tokenId).call();

        if (data[0].toLowerCase() != user.toLowerCase()) {
            return res.status(400).json({"status": "Failed", "reason": "OffSale permission denied"});
        }

        try {
            await gameContract.methods
            .offSale(user, tokenId)
            .send({
                from: account.address,
                gas: Number(process.env.GAS),
            })
            .on("receipt", async (receipt) => {
                return res.status(200).json({"status": "success", "reason": "OffSale successfully!"});
            })
        } catch (error) {
            console.error(error);
            return res.status(400).json({"status": "error", "reason": error});
        }
    });

    app.use('/api', passport.authenticate('jwt', { session: false }), router);
}

module.exports = gameApi
   