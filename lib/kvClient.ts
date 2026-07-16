import { kv } from "@vercel/kv";
import { makeKvStore, type KvLike } from "./kv";

export const boardStore = makeKvStore(kv as unknown as KvLike);
