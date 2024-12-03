import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { HelloWorldExample } from '../target/types/hello_world_example';
import {
  createMint,
  mintTo,
  getAssociatedTokenAddress,
  getOrCreateAssociatedTokenAccount,
  TOKEN_PROGRAM_ID
} from "@solana/spl-token";
import { assert, expect } from 'chai'
import fs from "fs";

const createKeypairFromFile = async (path) => {
  const keypairData = fs.readFileSync(path)
  const secretKey = JSON.parse(keypairData.toString())

  return anchor.web3.Keypair.fromSecretKey(new Uint8Array(secretKey))
}

const createFundedKeypair = async (connection, lamports = anchor.web3.LAMPORTS_PER_SOL) => {
  const wallet = anchor.web3.Keypair.generate();
  const signature = await connection.requestAirdrop(wallet.publicKey, lamports);

  const latestBlockHash = await connection.getLatestBlockhash();
  await connection.confirmTransaction({
    blockhash: latestBlockHash.blockhash,
    lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
    signature: signature,
  });

  return wallet;
}

describe("staking", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.HelloWorldExample as Program<HelloWorldExample>;
  console.log(`program_id ${program.programId}`)

  const stakingProgram = anchor.web3.Keypair.generate()
  const poolOwner = (program.provider as anchor.AnchorProvider).wallet

  let userAccount: anchor.web3.Keypair;
  let anchorTokenMint: anchor.web3.PublicKey;


  before(async () => {
    // create authority that manages out $ANCHOR token
    const anchorTokenAuthority = await createFundedKeypair(provider.connection)

    const anchorTokenMintKeypair = await createKeypairFromFile("keys/anchor_mint.json")
    console.log(`anchorTokenMintKeypair ${anchorTokenMintKeypair.publicKey.toString()}`)

    anchorTokenMint = await createMint(
      provider.connection,
      anchorTokenAuthority, // payer account, in our case is $ANCHOR token authority, but could be any
      anchorTokenAuthority.publicKey, // mint authority is the same as a payer
      null, // freeze authority is the same as a payer
      9, // decimals
      anchorTokenMintKeypair // address of our token (it's the same token mint as ANCHOR_MINT_ADDRESS)
    );

    expect(anchorTokenMintKeypair.publicKey.toString()).to.eq(anchorTokenMint.toString())

    const programAnchorAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      anchorTokenAuthority, // payer account, in our case is $ANCHOR token authority, but could be any
      anchorTokenMint, // address of our token (aka token mint)
      program.programId, // address for who we create ATA, our program_id in our case
      true, // flag that means, that account should be PDA
    )
    console.log(`programAnchorAta ${programAnchorAta.address.toString()}`)

    userAccount = await createFundedKeypair(provider.connection)
    console.log(`user ${userAccount.publicKey.toString()}`)

    const userAnchorAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      anchorTokenAuthority, // payer account, in our case is $ANCHOR token authority, but could be any
      anchorTokenMint, // address of our token (aka token mint)
      userAccount.publicKey, // address for who we create ATA, user public key in our case
      true, // flag that means, that account should be PDA
    )
    console.log(`userAnchorAta ${userAnchorAta.address.toString()}`)

    await mintTo(
      provider.connection,
      anchorTokenAuthority, // payer account, in our case is $ANCHOR token authority, but could be any
      anchorTokenMint, // address of our token (aka token mint)
      userAnchorAta.address,
      anchorTokenAuthority, // a pubkey is not enough, otherwise anyone would be printing tokens!
      anchor.web3.LAMPORTS_PER_SOL,
    );
  });

  it("Is initialized!", async () => {
    const tx = await program.methods.initialize("Danylo").accounts({
      pool: stakingProgram.publicKey,
      authority: poolOwner.publicKey,
    })
      .signers([stakingProgram])
      .rpc();
    console.log("Your transaction signature", tx);
    const state = await program.account.pool.fetch(stakingProgram.publicKey)
    console.log(`state ${JSON.stringify(state)}`)
    expect(state.authority.toString()).to.equal(poolOwner.publicKey.toString());
    expect(state.userCount).to.equal(0);
  });
  it('is user created!', async () => {
    const [userPDA, _] = await anchor.web3.PublicKey.findProgramAddress(
      [
        anchor.utils.bytes.utf8.encode('user'),
        userAccount.publicKey.toBuffer(),
      ],
      program.programId
    )

    const tx = await program.methods
      .createUser()
      .accounts({
        user: userPDA,
        authority: userAccount.publicKey,
        pool: stakingProgram.publicKey,
      })
      .signers([userAccount])
      .rpc()

    console.log(`tx ${tx}`)

    const state = await program.account.pool.fetch(stakingProgram.publicKey)
    console.log(`state ${JSON.stringify(state)}`)
    expect(state.userCount).to.equal(1)

    const user = await program.account.user.fetch(userPDA)
    console.log(`user ${JSON.stringify(user)}`)
    expect(user.stake.toNumber()).to.equal(0)
  })

  it('is user staked!', async () => {
    const [userPDA, _] = await anchor.web3.PublicKey.findProgramAddress(
      [
        anchor.utils.bytes.utf8.encode('user'),
        userAccount.publicKey.toBuffer(),
      ],
      program.programId
    )

    const userAnchorAta = await getAssociatedTokenAddress(
      anchorTokenMint, // address of our token (aka token mint)
      userAccount.publicKey, // address for who we create ATA, userAccount public key in our case
      true, // flag that means, that account should be PDA
    )
    console.log(`userAnchorAta ${userAnchorAta.toString()}`)

    const programAnchorAta = await getAssociatedTokenAddress(
      anchorTokenMint, // address of our token (aka token mint)
      program.programId, // address for who we create ATA, our program_id in our case
      true, // flag that means, that account should be PDA
    )

    console.log(`programAnchorAta ${programAnchorAta.toString()}`)

    const tx = await program.methods
      .stake(new anchor.BN(anchor.web3.LAMPORTS_PER_SOL))
      .accounts({
        user: userPDA,
        pool: stakingProgram.publicKey,
        anchorMint: anchorTokenMint,
        userAnchorAta: userAnchorAta,
        userAnchorAtaAuthority: userAccount.publicKey,
        programAnchorAta: programAnchorAta,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([userAccount])
      .rpc()
  });

  // TODO: write unstake tests
});