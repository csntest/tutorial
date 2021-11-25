import {Pool, Participation, User} from "../types";
import {MoonbeamEvent} from '@subql/contract-processors/dist/moonbeam';
import {BigNumber} from "ethers";

// Setup types from ABI
type DepositEventArgs = [string, BigNumber, BigNumber] & { user: string; amount: BigNumber; pid: BigNumber; };
type WithdrawEventArgs = [string, BigNumber, BigNumber] & { user: string; amount: BigNumber; pid: BigNumber; };

function createPool(pid: BigNumber, amount: BigNumber): Pool {
    let pool = new Pool(pid.toString());
    pool.totalAmount = amount.toBigInt();
    pool.totalUsers = BigInt(0);
    pool.averageAmountCommited = BigInt(0);
    pool.maxAmountCommited = BigInt(0);
    pool.minAmountCommited = BigInt(0);
    return pool;
}

function createPartitipation(address: string, pid: BigNumber, amount: BigNumber): Participation {
    let participation = new Participation(address + '-' + pid)
    participation.pid = pid.toNumber();
    participation.amount = amount.toBigInt();
    return participation;
}

function createUser(address: string, amount: BigNumber, participationId: string): User {
    let user = new User(address);
    user.totalAmount = amount.toBigInt();
    user.participationsId = [];
    user.participationsId.push(participationId);
    return user;
}

function updatePool(pool: Pool, amount: BigNumber): Pool {
    pool.averageAmountCommited = pool.totalAmount / pool.totalUsers;
    if (pool.maxAmountCommited < amount.toBigInt()) {
        pool.maxAmountCommited = amount.toBigInt();
    }
    if (pool.minAmountCommited > amount.toBigInt()) {
        pool.minAmountCommited = amount.toBigInt();
    }
    return pool;
}

export async function handleDepositEvent(event: MoonbeamEvent<DepositEventArgs>): Promise<void> {
    const address = event.args.user;
    const pid = event.args.pid
    const amount = event.args.amount

    let pool = await Pool.get(pid.toString());
    if (!pool) {
        pool = createPool(pid, amount);
    } else {
        pool.totalAmount = pool.totalAmount + amount.toBigInt();
    }

    let user = await User.get(address);
    let participation;
    if (!user) {
        participation = createPartitipation(address, pid, amount);
        user = createUser(address, amount, participation.id);
        pool.totalUsers = pool.totalUsers + BigInt(1);
    } else {
        user.totalAmount = user.totalAmount + amount.toBigInt();
        participation = Participation.get(address + '-' + pid);
        if (!participation) {
            participation = createPartitipation(address, pid, amount);
            user.participationsId.push(participation.id)
        } else {
            participation.amount = participation.amount + amount;
        }
    }

    await participation.save();
    await user.save();

    pool.totalAmount = pool.totalAmount + amount.toBigInt();
    pool = updatePool(pool, amount);

    await pool.save();
}

export async function handleWithdrawEvent(event: MoonbeamEvent<WithdrawEventArgs>): Promise<void> {
    const address = event.args.user;
    const pid = event.args.pid
    const amount = event.args.amount

    let pool = await Pool.get(pid.toString());
    pool.totalAmount = pool.totalAmount - amount.toBigInt();

    let user = await User.get(address);
    user.totalAmount = user.totalAmount - amount.toBigInt();

    let participation = await Participation.get(address + '-' + pid);
    participation.amount = participation.amount - amount.toBigInt();

    if (!participation.amount) {
        pool.totalUsers = pool.totalUsers - BigInt(1);
    }

    pool = updatePool(pool, amount);

    await participation.save();
    await user.save()
    await pool.save()
}
