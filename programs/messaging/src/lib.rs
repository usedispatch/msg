use anchor_lang::prelude::*;

declare_id!("G3mefhJTnrSAtkrGFtztYeAo9nkM1kyNXkqaFkikfAmD");

const _PROTOCOL_SEED: &[u8] = "messaging".as_bytes();
const _MAILBOX_SEED: &[u8] = "mailbox".as_bytes();
const _MESSAGE_SEED: &[u8] = "message".as_bytes();

#[program]
pub mod messaging {
    use super::*;
    /// Send a message to the receiver. Note that anyone can create a mailbox for the receiver
    /// and send messages.
    pub fn send_message(ctx: Context<SendMessage>, data: String) -> ProgramResult {
        let mailbox = &mut ctx.accounts.mailbox;
        mailbox.message_count = mailbox.message_count + 1;

        let message = &mut ctx.accounts.message;
        message.sender = ctx.accounts.sender.key().clone();
        message.payer = ctx.accounts.payer.key().clone();
        message.data = data;

        Ok(())
    }

    /// Close the next message account and send rent to the receiver. Note, only
    /// the receiver can do this.
    pub fn close_message(ctx: Context<CloseMessage>) -> ProgramResult {
        let mailbox = &mut ctx.accounts.mailbox;
        mailbox.read_message_count = mailbox.read_message_count + 1;

        if mailbox.read_message_count > mailbox.message_count {
            return Err(ProgramError::InvalidArgument);
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
    pub receiver: AccountInfo<'info>,

    #[account(init,
        payer = payer,
        space =
            8                               // account discriminator
            + 32                            // sender pubkey
            + 32                            // payer pubkey
            + 4 + data.as_bytes().len(),    // payload string
        seeds = [_PROTOCOL_SEED, _MESSAGE_SEED, receiver.key().as_ref(), &mailbox.message_count.to_le_bytes()],
        bump,
    )]
    pub message: Account<'info, Message>,

    #[account(mut)]
    pub payer: Signer<'info>,
    pub sender: AccountInfo<'info>,

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
        seeds = [_PROTOCOL_SEED, _MESSAGE_SEED, receiver.key().as_ref(), &mailbox.read_message_count.to_le_bytes()],
        bump,
    )]
    pub message: Account<'info, Message>,

    #[account(mut,
        address = message.payer,
    )]
    pub rent_destination: AccountInfo<'info>,

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
