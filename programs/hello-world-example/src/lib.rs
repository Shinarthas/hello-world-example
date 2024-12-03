use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount};

//
//Token Mint Address: JDquiTjtikDd8U6Jr8Ks5Krd8CzFbkQB5HkPXsRy3J4J
// Associated token account: zznseKZctLJua7S8yHhjNhwQmLtAK7grzha7ecuzM2U

declare_id!("4y7EVWEKG4a1jwwSLMbhoMHHgBPvDnmjgzsnR6qQR7mQ");
const ANCHOR_MINT_ADDRESS: &str = "cbGykaK1WPrM6LMjpNR4fjBPv6YhfujLmEj4shxTCfv";

#[program]
pub mod hello_world_example {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, name: String) -> Result<String> {
        let message: String = format!("Greetings from: {:?} to {name}", ctx.program_id);
        ctx.accounts.pool.authority = ctx.accounts.authority.key();
        ctx.accounts.pool.user_count = 0u32;
        ctx.accounts.pool.total_staked = 0u64;
        msg!(&message);
        Ok(message)
    }

    pub fn create_user(ctx: Context<CreateUser>) -> Result<()> {
        let user: &mut Account<'_, User> = &mut ctx.accounts.user;
        user.stake = 0u64;
        user.bump = ctx.bumps.user;
        ctx.accounts.pool.user_count = ctx.accounts.pool.user_count + 1;
        Ok(())
    }

    pub fn stake(ctx: Context<Stake>, amount: u64) -> Result<()> {
        let cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            token::Transfer {
                from: ctx.accounts.user_anchor_ata.to_account_info(),
                authority: ctx.accounts.user_anchor_ata_authority.to_account_info(),
                to: ctx.accounts.program_anchor_ata.to_account_info(),
            },
        );
        token::transfer(cpi_ctx, amount)?;
        ctx.accounts.user.stake += amount;
        ctx.accounts.pool.total_staked += amount;
        Ok(())
    }

    // TODO: figure out better context
    pub fn unstake(ctx: Context<Stake>, amount: u64) -> Result<()> {
        if ctx.accounts.user.stake < amount {
            return Err(ProgramErrorCode::InsufficientStake.into());
        }
        // TODO: fix transaction, incorrect signer
        let cpi_ctx = CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            token::Transfer {
                from: ctx.accounts.program_anchor_ata.to_account_info(),
                authority: ctx.accounts.user_anchor_ata_authority.to_account_info(),
                to: ctx.accounts.user_anchor_ata.to_account_info(),
            },
        );
        token::transfer(cpi_ctx, amount)?;
        ctx.accounts.user.stake -= amount;
        ctx.accounts.pool.total_staked -= amount;
        Ok(())
    }

    // TODO: write simple reward function
}
// TODO: move structs to a different file
pub const POOL_STORAGE_TOTAL_BYTES: usize = 32 + 4;
#[account]
pub struct Pool {
    pub authority: Pubkey,
    pub user_count: u32,
    pub total_staked: u64,
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = authority, space = 32 + POOL_STORAGE_TOTAL_BYTES)]
    pub pool: Account<'info, Pool>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

pub const USER_STORAGE_TOTAL_BYTES: usize = 1 + 8;
#[account]
pub struct User {
    bump: u8,
    stake: u64,
}
#[derive(Accounts)]
pub struct CreateUser<'info> {
    #[account(
        init, payer = authority,
        space = 8 + USER_STORAGE_TOTAL_BYTES,
        seeds = [b"user", authority.key().as_ref()],
        bump
    )]
    pub user: Account<'info, User>,
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(mut)]
    pub pool: Account<'info, Pool>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Stake<'info> {
    #[account(mut)]
    pub pool: Account<'info, Pool>,
    // Used to update staked amount by user
    #[account(
        mut,
        seeds = [b"user", user_anchor_ata_authority.key().as_ref()],
        bump
    )]
    pub user: Account<'info, User>,
    // Require for the deriving associated token accounts
    #[account(
        address = ANCHOR_MINT_ADDRESS.parse::<Pubkey>().unwrap()
    )]
    pub anchor_mint: Account<'info, Mint>,
    // Associated Token Account for User which holds $ANCHOR.
    #[account(mut)]
    pub user_anchor_ata: Account<'info, TokenAccount>,
    // The authority allowed to mutate user anchor's associated token account
    pub user_anchor_ata_authority: Signer<'info>,
    // Used to receive $ANCHOR from users
    #[account(mut)]
    pub program_anchor_ata: Account<'info, TokenAccount>,
    // SPL Token Program
    pub token_program: Program<'info, Token>,
}

#[error_code]
pub enum ProgramErrorCode {
    #[msg("Insufficient stake for this operation.")]
    InsufficientStake,
    #[msg("Unauthorized access.")]
    Unauthorized,
    #[msg("Overflow error occurred.")]
    Overflow,
}
