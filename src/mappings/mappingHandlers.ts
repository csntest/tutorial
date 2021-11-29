import {Pool, Participation, User} from "../types";
import {MoonbeamEvent} from '@subql/contract-processors/dist/moonbeam';
import {BigNumber} from "ethers";

// Setup types from ABI
type DepositEventArgs = [string, BigNumber, BigNumber] & { user: string; amount: BigNumber; pid: BigNumber; };
type WithdrawEventArgs = [string, BigNumber, BigNumber] & { user: string; amount: BigNumber; pid: BigNumber; };

function createPool(pid: BigNumber): Pool {
    let pool = new Pool(pid.toString());
    pool.totalAmount = BigInt(0);
    pool.totalUsers = BigInt(0);
    pool.averageAmountCommited = BigInt(0);
    pool.maxAmountCommited = BigInt(0);
    pool.minAmountCommited = BigInt(0);

    return pool;
}

async function createAndSavePartitipation(participationId: string, address: string, pid: BigNumber, amount: BigNumber): Promise<void> {
    let participation = new Participation(participationId)
    participation.pid = pid.toNumber();
    participation.amount = amount.toBigInt();
    participation.userId = address;

    return await participation.save();
}

async function createAndSaveUser(address: string, amount: BigNumber): Promise<void>  {
    let user = new User(address);
    user.totalAmount = amount.toBigInt();
    return user.save();
}

function updateAvMinMaxPool(pool: Pool, amount: BigNumber): Pool {
    pool.averageAmountCommited = pool.totalAmount / pool.totalUsers;
    if (pool.maxAmountCommited < amount.toBigInt()) {
        pool.maxAmountCommited = amount.toBigInt();
    }
    if (!pool.minAmountCommited || pool.minAmountCommited > amount.toBigInt()) {
        pool.minAmountCommited = amount.toBigInt();
    }
    return pool;
}

export async function handleDepositEvent(event: MoonbeamEvent<DepositEventArgs>): Promise<void> {
    const address = event.args.user;
    const pid = event.args.pid;
    const amount = event.args.amount;
    const participationId = address.concat('-').concat(pid.toString());

    let pool = await Pool.get(pid.toString());
    if (!pool) {
        pool = createPool(pid);
    }

    pool.totalAmount = pool.totalAmount + amount.toBigInt();

    const user = await User.get(address);
    if (!user) {
        await createAndSaveUser(address, amount);
        await createAndSavePartitipation(participationId, address, pid, amount);
        pool.totalUsers = pool.totalUsers + BigInt(1);

    } else {

        user.totalAmount = user.totalAmount + amount.toBigInt();
        await user.save();

        const participation = await Participation.get(participationId);
        if (!participation) {
            await createAndSavePartitipation(participationId, address, pid, amount);
            pool.totalUsers = pool.totalUsers + BigInt(1);
        } else if (!participation.amount) {
            pool.totalUsers = pool.totalUsers + BigInt(1);
            participation.amount = participation.amount + amount.toBigInt();
            await participation.save();
        } else {
            participation.amount = participation.amount + amount.toBigInt();
            await participation.save();
        }
    }

    pool = updateAvMinMaxPool(pool, amount);

    await pool.save();
}

export async function handleWithdrawEvent(event: MoonbeamEvent<WithdrawEventArgs>): Promise<void> {
    const address = event.args.user;
    const pid = event.args.pid;
    const amount = event.args.amount;

    let user = await User.get(address);
    user.totalAmount = user.totalAmount - amount.toBigInt();
    await user.save();

    let participation = await Participation.get(address + '-' + pid);
    participation.amount = participation.amount - amount.toBigInt();
    await participation.save();

    let pool = await Pool.get(pid.toString());
    pool.totalAmount = pool.totalAmount - amount.toBigInt();
    if (!participation.amount) {
        pool.totalUsers = pool.totalUsers - BigInt(1);
    }
    pool = updateAvMinMaxPool(pool, amount);
    await pool.save();
}
