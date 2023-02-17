const hre = require('hardhat')
const namehash = require('eth-ens-namehash')
const tld = 'astra'
const ethers = hre.ethers
const utils = ethers.utils
const labelhash = (label) => utils.keccak256(utils.toUtf8Bytes(label))
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const ZERO_HASH =
  '0x0000000000000000000000000000000000000000000000000000000000000000'

const ensAddr = '0x468c1C6C30b5912c4C0c3d5E8dfF9ea688cd53A8'
const resolver = '0x7D33c3BD5F52ae95916B33f80eC2250FB3F8fA85'
const controllerAddr = '0x0334De44A6d161eEdBF17Ac36AF8d94BacFe661b'

// const registrar = '0x39b05E5D8147B3673fADe39E8eE0749Fe830CCd7'
const main = async () => {
  const Web3 = require('web3')
  const web3 = new Web3('https://rpc.astranaut.dev')
  var ens = web3.eth.ens
  ens.registryAddress = ensAddr

  // let testlib = await ens.getAddress('astra')
  // console.log('testlib', testlib)
  // return
  const signers = await ethers.getSigners()

  const accounts = signers.map((s) => s.address)
  const controller = await ethers.getContractAt(
    'AstraRegistrarController',
    controllerAddr,
  )

  const available = await controller.available('phutang')
  const block = await web3.eth.getBlock('latest', false)
  const commit = await controller.makeCommitmentWithConfig(
    'phutang',
    accounts[0],
    labelhash('phu'),
    resolver,
    accounts[0],
  )
  const price = await controller.rentPrice('phutang', 2592000)
  console.log('commit', commit)
  console.log('price', price)
  console.log('available', available)

  const makecommit = await controller.commit(commit)
  await makecommit.wait()
  console.log('makecommit', makecommit)
  const register = await controller.registerWithConfig(
    'phutang',
    accounts[0],
    2592000,
    labelhash('phu'),
    resolver,
    accounts[0],
    {
      gasLimit: 3000005,
      value: ethers.utils.parseEther('0.9'),
    },
  )
  await register.wait()
  console.log('register', register)

  testlib = await ens.getAddress('phutang.astra')
  console.log('testlib', testlib)
  // testlib = await ens.getAddress('phutang')
  // console.log('testlib', testlib)
  testlib = await ens.getAddress('astra')
  console.log('testlib', testlib)
  // const astraResolver = await PublicResolver.deploy(
  //   ensAddr,
  //   ZERO_ADDRESS,
  //   ZERO_ADDRESS,
  //   ZERO_ADDRESS,
  // )
  // await astraResolver.deployed()

  // const masterResolver = PublicResolver.attach(testlib)
  // let tx = await masterResolver['setAddr(bytes32,address)'](
  //   namehash.hash('resolver.astra'),
  //   astraResolver.address,
  //   {
  //     gasLimit: 3000000,
  //   },
  // )
  // await tx.wait()
  // console.log('done')
  // tx = await ens.getAddress('phutang.astra')
  // console.log('testlib', tx)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })

// const ReverseRegistrar = await ethers.getContractFactory('ReverseRegistrar')
// const PublicResolver = await ethers.getContractFactory('PublicResolver')

// const ENSRegistry = await ethers.getContractAt('ENSRegistry', ensAddr)

// const registraAddr = await ENSRegistry.owner(namehash.hash(tld))

// const FIFSRegistrar = await ethers.getContractAt(
//   'FIFSRegistrar',
//   registraAddr,
// )
// const signers = await ethers.getSigners()
// const accounts = signers.map((s) => s.address)

// // const register = await FIFSRegistrar.register(
// //   labelhash('phutang'),
// //   accounts[0],
// // )
// // await register.wait()
// // console.log(register)

// const resolveAdr = await ENSRegistry.resolver(namehash.hash('astra'))
// console.log('owner', registraAddr)
// console.log('resolveAdr', resolveAdr)
// // const PublicResolver = await ethers.getContractAt(
// //   'PublicResolver',
// //   resolveAdr,
// // )

// // const setSubnodeRecord = await ENSRegistry.setSubnodeRecord(
// //   namehash.hash('astra'),
// //   labelhash('phutang'),
// //   '0x4C5734B90a70B14A2d14f8126C7Bf688eea36D64',
// //   '0xF9835e6ebdFe494B06cc1c1fE0d7f92E30aE9c19',
// //   31556926,
// //   {
// //     gasLimit: 3000001,
// //   },
// // )
// // await setSubnodeRecord.wait()
// // console.log(setSubnodeRecord)

// // const result = await PublicResolver['addr(bytes32)'](namehash.hash('abc'))

// let test = await ENSRegistry.owner(namehash.hash('resolver.astra'))

// const a = await ENSRegistry.resolver(namehash.hash('astra'))
// console.log(a)
// console.log(test)

// let temp = ethers.utils.keccak256(
//   ethers.utils.solidityPack(
//     ['bytes32', 'bytes32'],
//     [namehash.hash(tld), labelhash('phutang')],
//   ),
// )
// const temp2 = ethers.utils.keccak256(ethers.utils.dnsEncode('phutang.astra'))
// console.log(temp)
// console.log(temp2)
// console.log(ethers.utils.keccak256(namehash.hash('phutang.astra')))
// console.log(ethers.utils.keccak256(namehash.hash('phutang')))
// test = await ENSRegistry.owner(temp)

// console.log('test', test)
