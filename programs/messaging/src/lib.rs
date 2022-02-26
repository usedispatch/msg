use anchor_lang::prelude::*;
use anchor_lang::solana_program::system_instruction;
mod treasury;

#[cfg(feature = "mainnet")]
declare_id!("BHJ4tRcogS88tUhYotPfYWDjR4q7MGdizdiguY3N54rb");
#[cfg(not(feature = "mainnet"))]
declare_id!("BHJ4tRcogS88tUhYotPfYWDjR4q7MGdizdiguY3N54rb");

#[constant]
const MESSAGE_FEE_LAMPORTS: u64 = 50000;
#[constant]
const PROTOCOL_SEED: & str = "messaging";
#[constant]
const MAILBOX_SEED: & str = "mailbox";
#[constant]
const MESSAGE_SEED: & str = "message";
const _PROTOCOL_SEED: &[u8] = PROTOCOL_SEED.as_bytes();
const _MAILBOX_SEED: &[u8] = MAILBOX_SEED.as_bytes();
const _MESSAGE_SEED: &[u8] = MESSAGE_SEED.as_bytes();

#[program]
pub mod messaging {
    use super::*;
    /// Send a message to the receiver. Note that anyone can create a mailbox for the receiver
    /// and send messages.
    pub fn send_message(ctx: Context<SendMessage>, data: String) -> Result<()> {
        let mailbox = &mut ctx.accounts.mailbox;
        mailbox.message_count = mailbox.message_count + 1;

        let message = &mut ctx.accounts.message;
        message.sender = ctx.accounts.sender.key().clone();
        message.payer = ctx.accounts.payer.key().clone();
        message.data = data;

        system_instruction::transfer(ctx.accounts.payer.key, ctx.accounts.fee_receiver.key, MESSAGE_FEE_LAMPORTS);

        emit!(DispatchMessage {
            sender_pubkey: message.sender,
            receiver_pubkey: ctx.accounts.receiver.key(),
            message_index: mailbox.message_count - 1,
            message: message.data.clone(),
        });

        Ok(())
    }

    /// Close the next message account and send rent to the original payer. Note, only
    /// the receiver can do this.
    pub fn close_message(ctx: Context<CloseMessage>) -> Result<()> {
        let mailbox = &mut ctx.accounts.mailbox;
        mailbox.read_message_count = mailbox.read_message_count + 1;

        if mailbox.read_message_count > mailbox.message_count {
            return Err(Error::from(ProgramError::InvalidArgument).with_source(source!()));
        }

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(data: String)]
pub struct SendMessage<'info> {
    #[account(init_if_needed,
        payer = payer,
        seeds = [_PROTOCOL_SEED, _MAILBOX_SEED, receiver.key().as_ref()],
        bump,
    )]
    pub mailbox: Account<'info, Mailbox>,
    /// CHECK: we do not access the data in the receiver
    pub receiver: UncheckedAccount<'info>,

    #[account(init,
        payer = payer,
        space =
            8                               // account discriminator
            + 32                            // sender pubkey
            + 32                            // payer pubkey
            + 4 + data.as_bytes().len(),    // payload string
        seeds = [_PROTOCOL_SEED, _MESSAGE_SEED, mailbox.key().as_ref(), &mailbox.message_count.to_le_bytes()],
        bump,
    )]
    pub message: Account<'info, Message>,

    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: we do not access the data in the sender
    pub sender: UncheckedAccount<'info>,
    /// CHECK: we do not access the data in the fee_receiver other than to transfer lamports to it
    #[account(mut,
        address = treasury::TREASURY_ADDRESS,
    )]
    pub fee_receiver: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CloseMessage<'info> {
    #[account(mut,
        seeds = [_PROTOCOL_SEED, _MAILBOX_SEED, receiver.key().as_ref()],
        bump,
    )]
    pub mailbox: Account<'info, Mailbox>,
    pub receiver: Signer<'info>,

    #[account(mut,
        close = rent_destination,
        seeds = [_PROTOCOL_SEED, _MESSAGE_SEED, mailbox.key().as_ref(), &mailbox.read_message_count.to_le_bytes()],
        bump,
    )]
    pub message: Account<'info, Message>,

    /// CHECK: we do not access the data in the rent_destination other than to transfer lamports to it
    #[account(mut,
        address = message.payer,
    )]
    pub rent_destination: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[account]
#[derive(Default)]
pub struct Mailbox {
    pub read_message_count: u32,
    pub message_count: u32,
}

#[account]
#[derive(Default)]
pub struct Message {
    pub sender: Pubkey,
    pub payer: Pubkey,
    pub data: String,
}

#[event]
pub struct DispatchMessage {
    pub sender_pubkey: Pubkey,
    pub receiver_pubkey: Pubkey,
    pub message_index: u32,
    pub message: String,
}
