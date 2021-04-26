const fs = require('fs')
const chalk = require('chalk')
const { config, ethers } = require('hardhat')
const { utils, BigNumber: BN } = ethers
const { use, expect } = require('chai')
const { solidity } = require('ethereum-waffle')
const n = require('eth-ens-namehash')
const namehash = n.hash
const { loadENSContract } = require('../utils/contracts')
const baseRegistrarJSON = require('./baseRegistrarABI')

use(solidity)

const labelhash = (label) => utils.keccak256(utils.toUtf8Bytes(label))
const ROOT_NODE =
  '0x0000000000000000000000000000000000000000000000000000000000000000'

const addresses = {}

async function deploy(name, _args) {
  const args = _args || []

  console.log(`📄 ${name}`)
  const contractArtifacts = await ethers.getContractFactory(name)
  const contract = await contractArtifacts.deploy(...args)
  console.log(chalk.cyan(name), 'deployed to:', chalk.magenta(contract.address))
  fs.writeFileSync(`artifacts/${name}.address`, contract.address)
  console.log('\n')
  contract.name = name
  addresses[name] = contract.address
  return contract
}

describe('NFT fuse wrapper', () => {
  let ENSRegistry
  let ENSRegistry2
  let BaseRegistrar
  let NFTFuseWrapper
  let signers
  let account
  let account2
  let result

  /* Utility funcs */

  async function registerSetupAndWrapName(label, account, fuses) {
    const tokenId = labelhash(label)

    await BaseRegistrar.register(tokenId, account, 84600)

    await BaseRegistrar.setApprovalForAll(NFTFuseWrapper.address, true)

    await NFTFuseWrapper.wrapETH2LD(label, fuses, account)
  }

  before(async () => {
    signers = await ethers.getSigners()
    account = await signers[0].getAddress()
    account2 = await signers[1].getAddress()

    console.log('account2', account2)

    const registryJSON = loadENSContract('ens', 'ENSRegistry')

    const registryContractFactory = new ethers.ContractFactory(
      registryJSON.abi,
      registryJSON.bytecode,
      signers[0]
    )

    EnsRegistry = await registryContractFactory.deploy()
    EnsRegistry2 = EnsRegistry.connect(signers[1])

    try {
      const rootOwner = await EnsRegistry.owner(ROOT_NODE)
    } catch (e) {
      console.log('failing on rootOwner', e)
    }
    console.log('succeeded on root owner')

    BaseRegistrar = await new ethers.ContractFactory(
      baseRegistrarJSON.abi,
      baseRegistrarJSON.bytecode,
      signers[0]
    ).deploy(EnsRegistry.address, namehash('eth'))

    console.log(`*** BaseRegistrar deployed at ${BaseRegistrar.address} *** `)

    await BaseRegistrar.addController(account)

    NFTFuseWrapper = await deploy('NFTFuseWrapper', [
      EnsRegistry.address,
      BaseRegistrar.address,
    ])

    // setup .eth
    await EnsRegistry.setSubnodeOwner(
      ROOT_NODE,
      utils.keccak256(utils.toUtf8Bytes('eth')),
      account
    )

    // setup .xyz
    await EnsRegistry.setSubnodeOwner(
      ROOT_NODE,
      utils.keccak256(utils.toUtf8Bytes('xyz')),
      account
    )

    // give .eth back to registrar

    // make base registrar owner of eth
    await EnsRegistry.setSubnodeOwner(
      ROOT_NODE,
      labelhash('eth'),
      BaseRegistrar.address
    )

    const ethOwner = await EnsRegistry.owner(namehash('eth'))
    const ensEthOwner = await EnsRegistry.owner(namehash('ens.eth'))

    console.log('ethOwner', ethOwner)
    console.log('ensEthOwner', ensEthOwner)

    console.log(
      'ens.setApprovalForAll NFTFuseWrapper',
      account,
      addresses['NFTFuseWrapper']
    )

    //make sure base registrar is owner of eth TLD

    const ownerOfEth = await EnsRegistry.owner(namehash('eth'))

    expect(ownerOfEth).to.equal(BaseRegistrar.address)
  })

  beforeEach(async () => {
    result = await ethers.provider.send('evm_snapshot')
  })
  afterEach(async () => {
    await ethers.provider.send('evm_revert', [result])
  })

  describe('wrap()', () => {
    it('wrap() - Wraps a name if you are the owner', async () => {
      const fuses = await NFTFuseWrapper.MINIMUM_PARENT_FUSES()

      await EnsRegistry.setApprovalForAll(NFTFuseWrapper.address, true)
      await NFTFuseWrapper.wrap(ROOT_NODE, 'xyz', fuses, account)
      const ownerOfWrappedXYZ = await NFTFuseWrapper.ownerOf(namehash('xyz'))
      expect(ownerOfWrappedXYZ).to.equal(account)
    })

    it('wrap() - emits correct events', async () => {
      const fuses = await NFTFuseWrapper.MINIMUM_PARENT_FUSES()

      await EnsRegistry.setApprovalForAll(NFTFuseWrapper.address, true)

      const tx = NFTFuseWrapper.wrap(ROOT_NODE, 'xyz', fuses, account)
      await expect(tx).to.emit(NFTFuseWrapper, 'Wrap')

      await expect(tx).to.emit(NFTFuseWrapper, 'TransferSingle')
    })

    it('wrap() - Cannot wrap a name if the owner has not authorised the wrapper with the ENS registry.', async () => {
      expect(NFTFuseWrapper.wrap(ROOT_NODE, 'xyz', 0, account)).to.be.reverted
    })

    it('wrap() - Will not allow wrapping with a target address of 0x0 or the wrapper contract address.', async () => {
      expect(NFTFuseWrapper.wrap(ROOT_NODE, 'xyz', 0, '0x0')).to.be.reverted
    })

    it('wrap() - Allows an account approved by the owner on the ENS registry to wrap a name.', async () => {
      const labelhash = utils.keccak256(utils.toUtf8Bytes('abc'))

      // setup .abc with account2 as owner
      await EnsRegistry.setSubnodeOwner(ROOT_NODE, labelhash, account2)
      // allow account to deal with all account2's names
      await EnsRegistry2.setApprovalForAll(account, true)
      await EnsRegistry2.setApprovalForAll(NFTFuseWrapper.address, true)

      //confirm abc is owner by account2 not account 1
      expect(await EnsRegistry.owner(namehash('abc'))).to.equal(account2)
      // wrap using account
      await NFTFuseWrapper.wrap(ROOT_NODE, 'abc', 0, account2)
      const ownerOfWrappedXYZ = await NFTFuseWrapper.ownerOf(namehash('abc'))
      expect(ownerOfWrappedXYZ).to.equal(account2)
    })

    it('wrap() - Does not allow anyone else to wrap a name even if the owner has authorised the wrapper with the ENS registry.', async () => {
      const labelhash = utils.keccak256(utils.toUtf8Bytes('abc'))

      // setup .abc with account2 as owner
      await EnsRegistry.setSubnodeOwner(ROOT_NODE, labelhash, account2)
      await EnsRegistry2.setApprovalForAll(NFTFuseWrapper.address, true)

      //confirm abc is owner by account2 not account 1
      expect(await EnsRegistry.owner(namehash('abc'))).to.equal(account2)
      // wrap using account
      expect(NFTFuseWrapper.wrap(ROOT_NODE, 'abc', 0, account2)).to.be.reverted
    })

    it('wrap() - Does not allow wrapping .eth 2LDs.', async () => {
      const label = 'wrapped'
      const labelHash = labelhash(label)
      await BaseRegistrar.register(labelHash, account, 84600)
      await BaseRegistrar.setApprovalForAll(NFTFuseWrapper.address, true)
      expect(NFTFuseWrapper.wrap(ROOT_NODE, 'abc', 0, account2)).to.be.reverted
    })

    it('wrap() - Fuses cannot be burned if CANNOT_REPLACE_SUBDOMAIN has not burned', async () => {
      const fuses = [
        NFTFuseWrapper.CANNOT_UNWRAP(),
        NFTFuseWrapper.CANNOT_REPLACE_SUBDOMAIN(),
      ]

      const [CANNOT_UNWRAP, CANNOT_REPLACE_SUBDOMAIN] = await Promise.all(fuses)

      // register sub.xyz before we wrap xyz
      await EnsRegistry.setSubnodeOwner(
        namehash('xyz'),
        labelhash('sub'),
        account
      )

      await EnsRegistry.setApprovalForAll(NFTFuseWrapper.address, true)
      await NFTFuseWrapper.wrap(ROOT_NODE, 'xyz', CANNOT_UNWRAP, account)

      //attempt to burn fuse
      expect(
        NFTFuseWrapper.wrap(
          namehash('xyz'),
          'sub',
          CANNOT_REPLACE_SUBDOMAIN,
          account
        )
      ).to.be.revertedWith(
        'revert NFTFuseWrapper: Cannot burn fuses: parent name can replace subdomain'
      )
    })

    it('wrap() - Only allows fuses to be burned if CANNOT_UNWRAP is burned.', async () => {
      const fuses = [
        NFTFuseWrapper.CANNOT_UNWRAP(),
        NFTFuseWrapper.CANNOT_REPLACE_SUBDOMAIN(),
      ]

      const [CANNOT_UNWRAP, CANNOT_REPLACE_SUBDOMAIN] = await Promise.all(fuses)

      // register sub.xyz before we wrap xyz
      await EnsRegistry.setSubnodeOwner(
        namehash('xyz'),
        labelhash('sub'),
        account
      )

      await EnsRegistry.setApprovalForAll(NFTFuseWrapper.address, true)

      //attempt to burn fuse
      expect(
        NFTFuseWrapper.wrap(ROOT_NODE, 'xyz', CANNOT_REPLACE_SUBDOMAIN, account)
      ).to.be.revertedWith(
        'revert NFTFuseWrapper: Cannot burn fuses: domain can be unwrapped'
      )
    })
  })

  describe('unwrap()', () => {
    it('unwrap() - Allows owner to unwrap name', async () => {
      const fuses = await NFTFuseWrapper.MINIMUM_PARENT_FUSES()

      await EnsRegistry.setApprovalForAll(NFTFuseWrapper.address, true)
      await NFTFuseWrapper.wrap(ROOT_NODE, 'xyz', fuses, account)
      await NFTFuseWrapper.setSubnodeOwner(
        namehash('xyz'),
        labelhash('unwrapped'),
        account
      )
      await NFTFuseWrapper.wrap(namehash('xyz'), 'unwrapped', 0, account)
      const ownerOfWrappedXYZ = await NFTFuseWrapper.ownerOf(
        namehash('unwrapped.xyz')
      )
      expect(ownerOfWrappedXYZ).to.equal(account)
      await NFTFuseWrapper.unwrap(namehash('unwrapped.xyz'), account)

      //Transfers ownership in the ENS registry to the target address.
      expect(await EnsRegistry.owner(namehash('unwrapped.xyz'))).to.equal(
        account
      )

      //TODO: Emits the Unwrapped event.
      //TODO: Emits the TransferSingle event to 0x0.
    })

    it('unwrap() - Allows an account authorised by the owner on the ENS registry to unwrap a name', async () => {})

    it('unwrap() - Does not allow anyone else to unwrap a name even if the owner has authorised the wrapper with the ENS registry.', async () => {})

    it('unwrap() - Will not unwrap .eth 2LDs.', async () => {})

    it('unwrap() - Will not allow a target address of 0x0 or the wrapper contract address.', async () => {})

    it('unwrap() - Clears fuses for the name', async () => {})
  })

  it('unwrapETH2LD() - Allows the owner to unwrap a name.', async () => {
    const label = 'unwrapped'
    const labelHash = labelhash(label)

    await BaseRegistrar.register(labelHash, account, 84600)

    //allow the restricted name wrappper to transfer the name to itself and reclaim it
    await BaseRegistrar.setApprovalForAll(NFTFuseWrapper.address, true)

    await NFTFuseWrapper.wrapETH2LD(label, 0, account)
    const ownerOfWrappedETH = await NFTFuseWrapper.ownerOf(
      namehash('unwrapped.eth')
    )
    expect(ownerOfWrappedETH).to.equal(account)
    await NFTFuseWrapper.unwrapETH2LD(labelHash, account)
    // transfers the controller on the .eth registrar to the target address.
    const ownerInRegistry = await EnsRegistry.owner(namehash('unwrapped.eth'))
    expect(ownerInRegistry).to.equal(account)
    //Transfers the registrant on the .eth registrar to the target address
    const ownerInRegistrar = await BaseRegistrar.ownerOf(labelHash)
    expect(ownerInRegistrar).to.equal(account)

    //TODO: Emits the Unwrapped event.
    //Emits the TransferSingle event to 0x0.
  })

  it('unwrapETH2LD() - Allows an account authorised by the owner on the ENS registry to unwrap a name', async () => {})

  it('unwrapETH2LD() - Does not allow anyone else to unwrap a name even if the owner has authorised the wrapper with the ENS registry.', async () => {})

  it('unwrapETH2LD() - Does not allow anyone else to unwrap a name even if the owner has authorised the wrapper with the ENS registry.', async () => {})

  it('unwrapETH2LD() - Clears fuses for the name.', async () => {})

  it('wrapETH2LD() - wraps a name if sender is owner', async () => {
    const label = 'wrapped2'
    const labelHash = labelhash(label)
    const nameHash = namehash(label + '.eth')

    await BaseRegistrar.register(labelHash, account, 84600)

    //allow the restricted name wrappper to transfer the name to itself and reclaim it
    await BaseRegistrar.setApprovalForAll(NFTFuseWrapper.address, true)

    await NFTFuseWrapper.wrapETH2LD(label, 255, account)

    //make sure reclaim claimed ownership for the wrapper in registry

    expect(await EnsRegistry.owner(nameHash)).to.equal(NFTFuseWrapper.address)

    //make sure owner in the wrapper is the user

    expect(await NFTFuseWrapper.ownerOf(nameHash)).to.equal(account)

    // make sure registrar ERC721 is owned by Wrapper

    expect(await BaseRegistrar.ownerOf(labelHash)).to.equal(
      NFTFuseWrapper.address
    )

    // make sure it can't be unwrapped
    const canUnwrap = await NFTFuseWrapper.canUnwrap(nameHash)

    // TODO: Emits the Wrapped event.
    // TODO: Emits the TransferSingle event from 0x0.
  })

  it('wrapETH2LD() - Cannot wrap a name if the owner has not authorised the wrapper with the .eth registrar.', async () => {})

  it('wrapETH2LD() - Transfers the wrapped token to the target address.', async () => {})

  it('wrapETH2LD() - Will not allow wrapping with a target address of 0x0 or the wrapper contract address.', async () => {})

  it('wrapETH2LD() - Allows an account approved by the owner on the .eth registrar to wrap a name.', async () => {})

  it('wrapETH2LD() - Does not allow anyone else to wrap a name even if the owner has authorised the wrapper with the ENS registry.', async () => {
    // authorise the registry, then attempt to wrap it with account 2
  })

  it('wrapETH2LD() - Can wrap a name even if the controller address is different to the registrant address.', async () => {})

  it('wrapETH2LD() - Does not allow the controller of a name to wrap it unless they are also the registrant.', async () => {})

  it('wrapETH2LD() - Only allows fuses to be burned if CANNOT_UNWRAP is burned.', async () => {})

  it('ownerOf() - Returns the owner', async () => {
    const label = 'subdomain'
    const tokenId = labelhash(label)
    const wrappedTokenId = namehash(label + '.eth')
    const CAN_DO_EVERYTHING = 0

    await BaseRegistrar.register(tokenId, account, 84600)

    const ownerInBaseRegistrar = await BaseRegistrar.ownerOf(tokenId)

    await BaseRegistrar.setApprovalForAll(NFTFuseWrapper.address, true)
    await NFTFuseWrapper.wrapETH2LD(label, CAN_DO_EVERYTHING, account)

    const owner = await NFTFuseWrapper.ownerOf(wrappedTokenId)

    expect(owner).to.equal(account)
  })

  it('can send ERC721 token to restricted wrapper', async () => {
    const tokenId = labelhash('send2contract')
    const wrappedTokenId = namehash('send2contract.eth')

    await BaseRegistrar.register(tokenId, account, 84600)

    const ownerInRegistrar = await BaseRegistrar.ownerOf(tokenId)

    await BaseRegistrar['safeTransferFrom(address,address,uint256)'](
      account,
      NFTFuseWrapper.address,
      tokenId
    )

    const ownerInWrapper = await NFTFuseWrapper.ownerOf(wrappedTokenId)

    expect(ownerInWrapper).to.equal(account)
  })

  it('can set fuses and then burn ability to burn fuses', async () => {
    const label = 'burnabilitytoburn'
    const tokenId = labelhash(label)
    const wrappedTokenId = namehash(label + '.eth')
    const CAN_DO_EVERYTHING = 0
    const CANNOT_UNWRAP = await NFTFuseWrapper.CANNOT_UNWRAP()

    await BaseRegistrar.register(tokenId, account, 84600)

    await BaseRegistrar.setApprovalForAll(NFTFuseWrapper.address, true)

    await NFTFuseWrapper.wrapETH2LD(
      label,
      CAN_DO_EVERYTHING | CANNOT_UNWRAP,
      account
    )

    await NFTFuseWrapper.burnFuses(
      namehash('eth'),
      tokenId,
      CAN_DO_EVERYTHING | (await NFTFuseWrapper.CANNOT_BURN_FUSES())
    )

    const ownerInWrapper = await NFTFuseWrapper.ownerOf(wrappedTokenId)

    expect(ownerInWrapper).to.equal(account)

    // check flag in the wrapper

    expect(await NFTFuseWrapper.canBurnFuses(wrappedTokenId)).to.equal(false)

    const CANNOT_REPLACE_SUBDOMAIN = await NFTFuseWrapper.CANNOT_REPLACE_SUBDOMAIN()

    //try to set the resolver and ttl
    expect(
      NFTFuseWrapper.burnFuses(
        namehash('eth'),
        tokenId,
        CANNOT_REPLACE_SUBDOMAIN
      )
    ).to.be.reverted
  })

  it('can set fuses and burn transfer', async () => {
    const [signer2] = await ethers.getSigners()
    const account2 = await signer2.getAddress()
    const label = 'fuses3'
    const tokenId = labelhash('fuses3')
    const wrappedTokenId = namehash('fuses3.eth')
    const CAN_DO_EVERYTHING = 0
    const CANNOT_UNWRAP = await NFTFuseWrapper.CANNOT_UNWRAP()

    await BaseRegistrar.register(tokenId, account, 84600)

    await BaseRegistrar.setApprovalForAll(NFTFuseWrapper.address, true)

    await NFTFuseWrapper.wrapETH2LD(
      label,
      CAN_DO_EVERYTHING | CANNOT_UNWRAP,
      account
    )

    await NFTFuseWrapper.burnFuses(
      namehash('eth'),
      tokenId,
      CAN_DO_EVERYTHING | (await NFTFuseWrapper.CANNOT_TRANSFER())
    )

    expect(await NFTFuseWrapper.ownerOf(wrappedTokenId)).to.equal(account)

    // check flag in the wrapper

    expect(await NFTFuseWrapper.canTransfer(wrappedTokenId)).to.equal(false)

    //try to set the resolver and ttl
    expect(
      NFTFuseWrapper.safeTransferFrom(
        account,
        account2,
        wrappedTokenId,
        1,
        '0x'
      )
    ).to.be.reverted
  })

  it('can set fuses and burn canSetData', async () => {
    const label = 'fuses1'
    const tokenId = labelhash(label)
    const wrappedTokenId = namehash(label + '.eth')
    const CAN_DO_EVERYTHING = 0
    const CANNOT_UNWRAP = await NFTFuseWrapper.CANNOT_UNWRAP()

    await BaseRegistrar.register(tokenId, account, 84600)

    await BaseRegistrar.setApprovalForAll(NFTFuseWrapper.address, true)

    await NFTFuseWrapper.wrapETH2LD(
      label,
      CAN_DO_EVERYTHING | CANNOT_UNWRAP,
      account
    )

    await NFTFuseWrapper.burnFuses(
      namehash('eth'),
      tokenId,
      CAN_DO_EVERYTHING | (await NFTFuseWrapper.CANNOT_SET_DATA())
    )

    expect(await NFTFuseWrapper.ownerOf(wrappedTokenId)).to.equal(account)

    // check flag in the wrapper
    expect(await NFTFuseWrapper.canSetData(wrappedTokenId)).to.equal(false)

    //try to set the resolver and ttl
    expect(NFTFuseWrapper.setResolver(wrappedTokenId, account)).to.be.reverted

    expect(NFTFuseWrapper.setTTL(wrappedTokenId, 1000)).to.be.reverted
  })

  it('can set fuses and burn canCreateSubdomains', async () => {
    const label = 'fuses2'
    const tokenId = labelhash(label)
    const wrappedTokenId = namehash(label + '.eth')
    const fuses = [
      NFTFuseWrapper.CAN_DO_EVERYTHING(),
      NFTFuseWrapper.CANNOT_UNWRAP(),
      NFTFuseWrapper.CANNOT_REPLACE_SUBDOMAIN(),
      NFTFuseWrapper.CANNOT_CREATE_SUBDOMAIN(),
    ]

    const [
      CAN_DO_EVERYTHING,
      CANNOT_UNWRAP,
      CANNOT_REPLACE_SUBDOMAIN,
      CANNOT_CREATE_SUBDOMAIN,
    ] = await Promise.all(fuses)

    await BaseRegistrar.register(tokenId, account, 84600)

    await BaseRegistrar.setApprovalForAll(NFTFuseWrapper.address, true)

    await NFTFuseWrapper.wrapETH2LD(
      label,
      CAN_DO_EVERYTHING | CANNOT_UNWRAP | CANNOT_REPLACE_SUBDOMAIN,
      account
    )

    const canCreateSubdomain1 = await NFTFuseWrapper.canCreateSubdomain(
      wrappedTokenId
    )

    expect(canCreateSubdomain1, 'createSubdomain is set to false').to.equal(
      true
    )

    // can create before burn

    //revert not approved and isn't sender because subdomain isnt owned by contract?
    await NFTFuseWrapper.setSubnodeOwnerAndWrap(
      wrappedTokenId,
      labelhash('creatable'),
      account,
      255
    )

    expect(await EnsRegistry.owner(namehash('creatable.fuses2.eth'))).to.equal(
      NFTFuseWrapper.address
    )

    expect(
      await NFTFuseWrapper.ownerOf(namehash('creatable.fuses2.eth'))
    ).to.equal(account)

    await NFTFuseWrapper.burnFuses(
      namehash('eth'),
      tokenId,
      CAN_DO_EVERYTHING | CANNOT_CREATE_SUBDOMAIN
    )

    const ownerInWrapper = await NFTFuseWrapper.ownerOf(wrappedTokenId)

    expect(ownerInWrapper).to.equal(account)

    const canCreateSubdomain = await NFTFuseWrapper.canCreateSubdomain(
      wrappedTokenId
    )

    expect(canCreateSubdomain).to.equal(false)

    //try to create a subdomain

    expect(
      NFTFuseWrapper.setSubnodeOwner(
        namehash('fuses2.eth'),
        labelhash('uncreateable'),
        account
      )
    ).to.be.reverted

    //expect replacing subdomain to succeed
  })

  it('can setSubnodeOwnerAndWrap', async () => {
    const label = 'subdomains'
    const tokenId = labelhash(label)
    const wrappedTokenId = namehash(label + '.eth')
    const CAN_DO_EVERYTHING = 0
    const CANNOT_UNWRAP = await NFTFuseWrapper.CANNOT_UNWRAP()
    const CANNOT_REPLACE_SUBDOMAIN = await NFTFuseWrapper.CANNOT_REPLACE_SUBDOMAIN()

    await registerSetupAndWrapName(
      label,
      account,
      CAN_DO_EVERYTHING | CANNOT_UNWRAP | CANNOT_REPLACE_SUBDOMAIN
    )

    // can create before burn

    //revert not approved and isn't sender because subdomain isnt owned by contract?
    await NFTFuseWrapper.setSubnodeOwnerAndWrap(
      wrappedTokenId,
      labelhash('setsubnodeownerandwrap'),
      account,
      255
    )

    expect(
      await EnsRegistry.owner(namehash('setsubnodeownerandwrap.subdomains.eth'))
    ).to.equal(NFTFuseWrapper.address)

    expect(
      await NFTFuseWrapper.ownerOf(
        namehash('setsubnodeownerandwrap.subdomains.eth')
      )
    ).to.equal(account)
  })

  it('can setSubnodeRecordAndWrap', async () => {
    const label = 'subdomains2'
    const tokenId = labelhash(label)
    const wrappedTokenId = namehash(label + '.eth')
    const CAN_DO_EVERYTHING = 0
    const CANNOT_UNWRAP = await NFTFuseWrapper.CANNOT_UNWRAP()
    const CANNOT_REPLACE_SUBDOMAIN = await NFTFuseWrapper.CANNOT_REPLACE_SUBDOMAIN()

    await registerSetupAndWrapName(
      label,
      account,
      CAN_DO_EVERYTHING | CANNOT_UNWRAP | CANNOT_REPLACE_SUBDOMAIN
    )

    // can create before burn

    //revert not approved and isn't sender because subdomain isnt owned by contract?
    await NFTFuseWrapper.setSubnodeRecordAndWrap(
      wrappedTokenId,
      labelhash('setsubnoderecordandwrap'),
      account,
      account,
      0,
      255
    )

    expect(
      await EnsRegistry.owner(
        namehash('setsubnoderecordandwrap.subdomains2.eth')
      )
    ).to.equal(NFTFuseWrapper.address)

    expect(
      await NFTFuseWrapper.ownerOf(
        namehash('setsubnoderecordandwrap.subdomains2.eth')
      )
    ).to.equal(account)
  })
})
