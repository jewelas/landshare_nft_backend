const getResource = async (gameContract, user, tokenId) => {
    const data = await gameContract.methods.getResource(user, tokenId).call();
    return data;
};

const getHouse = async (houseContract, tokenId) => {
    const house = await houseContract.methods.getHouse(tokenId).call();
    return house;
};
  
module.exports = {
    getResource,
    getHouse
};