const hre = require('hardhat')
const namehash = require('eth-ens-namehash')
const tld = 'astra'
const ethers = hre.ethers
const utils = ethers.utils
const labelhash = (label) => utils.keccak256(utils.toUtf8Bytes(label))
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const ZERO_HASH =
  '0x0000000000000000000000000000000000000000000000000000000000000000'
async function main() {
  const ENSRegistry = await ethers.getContractFactory('ENSRegistry')
  const FIFSRegistrar = await ethers.getContractFactory('FIFSRegistrar')
  const ReverseRegistrar = await ethers.getContractFactory('ReverseRegistrar')
  const PublicResolver = await ethers.getContractFactory('PublicResolver')
  const ETHRegistrarController = await ethers.getContractFactory(
    'AstraRegistrarController',
  )
  const BaseRegistrarImplementation = await ethers.getContractFactory(
    'BaseRegistrarImplementation',
  )
  const NameWrapper = await ethers.getContractFactory('NameWrapper')
  const StaticMetadataService = await ethers.getContractFactory(
    'StaticMetadataService',
  )
  const StablePriceOracle = await ethers.getContractFactory('StablePriceOracle')
  const signers = await ethers.getSigners()
  const accounts = signers.map((s) => s.address)

  const ens = await ENSRegistry.deploy()
  await ens.deployed()
  console.log('done ENSRegistry=', ens.address)
  const registrar = await FIFSRegistrar.deploy(ens.address, namehash.hash(tld))
  await registrar.deployed()
  console.log('done registrar', registrar.address)

  const reverseRegistrar = await ReverseRegistrar.deploy(ens.address)
  await reverseRegistrar.deployed()
  const staticMeta = await StaticMetadataService.deploy(
    'http://localhost:8080',
    {},
  )

  const baseRegistrarImplementation = await BaseRegistrarImplementation.deploy(
    ens.address,
    namehash.hash(tld),
  )
  const nw = await NameWrapper.deploy(
    ens.address,
    baseRegistrarImplementation.address,
    staticMeta.address,
  )
  const stablePriceOracle = await StablePriceOracle.deploy(
    ZERO_ADDRESS,
    [100, 80, 60, 40, 20, 10],
  )
  const astraRegistrarController = await ETHRegistrarController.deploy(
    baseRegistrarImplementation.address,
    stablePriceOracle.address,
    0,
    86400,
  )

  console.log('astraRegistrarController', astraRegistrarController.address)

  const resolver = await PublicResolver.deploy(
    ens.address,
    nw.address,
    astraRegistrarController.address,
    reverseRegistrar.address,
  )

  await resolver.deployed()
  console.log('done PublicResolver')

  await setupResolver(ens, resolver, accounts)
  console.log('done setupResolver', resolver.address)
  await setupRegistrar(ens, baseRegistrarImplementation, accounts)
  console.log('done setupRegistrar')
  await setupReverseRegistrar(ens, registrar, reverseRegistrar, accounts)
  console.log('done setupReverseRegistrar')

  await ens.setApprovalForAll(astraRegistrarController.address, true)
  await ens.setApprovalForAll(baseRegistrarImplementation.address, true)
  await ens.setApprovalForAll(nw.address, true)

  await resolver.setApprovalForAll(astraRegistrarController.address, true)
  await resolver.setApprovalForAll(baseRegistrarImplementation.address, true)
  await resolver.setApprovalForAll(nw.address, true)

  const approved = await resolver.setApprovalForAll(registrar.address, true)
  await approved.wait()
  console.log('test')
  const owner = await ens.owner(namehash.hash(tld))
  console.log('owner', owner)
  console.log(
    'baseRegistrarImplementation',
    baseRegistrarImplementation.address,
  )
  // const register = await registrar.register(
  //   labelhash('phutang'),
  //   accounts[0],
  //   accounts[0],
  //   100000,
  //   {
  //     gasLimit: 3000005,
  //   },
  // )
  // await register.wait()
  // console.log('register', register)
}

async function setupResolver(ens, resolver, accounts) {
  const resolverNode = namehash.hash('astra')
  const resolverLabel = labelhash('astra')
  await ens.setSubnodeOwner(ZERO_HASH, resolverLabel, accounts[0])

  await ens.setResolver(resolverNode, resolver.address, {
    gasLimit: 3000000,
  })

  await resolver['setAddr(bytes32,address)'](resolverNode, resolver.address, {
    gasLimit: 3000001,
  })
}

async function setupRegistrar(ens, registrar, accounts) {
  await ens.setSubnodeOwner(ZERO_HASH, labelhash(tld), registrar.address, {
    gasLimit: 3000002,
  })
}

async function setupReverseRegistrar(
  ens,
  registrar,
  reverseRegistrar,
  accounts,
) {
  await ens.setSubnodeOwner(ZERO_HASH, labelhash('reverse'), accounts[0], {
    gasLimit: 3000000,
  })
  await ens.setSubnodeOwner(
    namehash.hash('reverse'),
    labelhash('addr'),
    reverseRegistrar.address,
    {
      gasLimit: 3000000,
    },
  )
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
