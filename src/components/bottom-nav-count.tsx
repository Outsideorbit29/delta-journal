import { connection } from "next/server";
import { BottomNav } from "@/components/nav-links";
import { countToJournal } from "@/lib/queries";
import { currentUserId } from "@/lib/session";

/** The phone tab bar, with the number of trades from the last week still to journal on the Journal tab. */
export async function BottomNavWithCount() {
  await connection();
  const userId = await currentUserId();
  return <BottomNav toJournal={userId ? await countToJournal(userId) : 0} />;
}
