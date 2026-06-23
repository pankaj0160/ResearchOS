"""
demo_scale.py

Shows how sync vs async performance changes as user count grows.
This is the graph that every engineering team cares about.

Run it with:  python demo_scale.py
"""

import asyncio
import time


def fake_db_sync():
    time.sleep(0.05)    # 50ms database query

async def fake_db_async():
    await asyncio.sleep(0.05)


def measure_sync(num_users: int) -> float:
    """Returns total time to serve num_users synchronously."""
    start = time.perf_counter()
    for _ in range(num_users):
        fake_db_sync()
    return time.perf_counter() - start


async def measure_async(num_users: int) -> float:
    """Returns total time to serve num_users asynchronously."""
    start = time.perf_counter()
    await asyncio.gather(*[fake_db_async() for _ in range(num_users)])
    return time.perf_counter() - start


if __name__ == "__main__":
    print("\nHow does performance change as more users hit the server?")
    print("Each user needs one DB query that takes 50ms.\n")

    print(f"{'Users':<10} {'Sync (s)':<14} {'Async (s)':<14} {'Async is faster by'}")
    print("-" * 58)

    for num_users in [1, 2, 5, 10, 20, 50]:
        sync_time  = measure_sync(num_users)
        async_time = asyncio.run(measure_async(num_users))
        speedup    = sync_time / async_time

        bar = "█" * int(speedup)
        print(f"{num_users:<10} {sync_time:<14.2f} {async_time:<14.2f} {speedup:.0f}x  {bar}")

    print("\nSync time grows linearly with users (0.05s × users).")
    print("Async time stays almost flat — all users wait in parallel.")
    print("\nAt 50 users: async is ~50x faster than sync.")
    print("This is why every production backend uses async database calls.")