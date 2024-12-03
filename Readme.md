# Simple staking app with anchor

This app allows users to create stacking pools. And put some custom minted token to stake.

## TODO: Add FE usage section

## Build instructions

Run following commands to prepare enviroment

1. Set working enviroment to `localhost`. And keep it that way until you decide to deploy your application

```
solana config set --url localhost
```

2. Configure your own mint token with 

```
solana address -k ./keys/anchor_mint.json
```

3. Replace `ANCHOR_MINT_ADDRESS` with the public key from `./keys/anchor_mint.json` and put it into `programs/hello-world-example/src/lib.rs`

4. Run build command 

```
anchor build
```

5. Run tests

```
anchor test
```

## Deploy

In order to deploy your program set preffered enviroment with

```
solana config set --url devnet
```

and run deploy command after that

```
anchor deploy 
```

## Troubleshooting

If deploy failed make sure you have enough SOL to deploy your program

```
solana airdrop 1
```