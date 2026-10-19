import { Workspace } from "@rbxts/services";
import { HitboxServer, createServerTransport } from "@skyzwrl/hitboxes";
import { DAMAGE, SWINGS } from "./swings";

const hitboxes = new HitboxServer({
	swings: SWINGS,
	transport: createServerTransport(),
	onHit: (_, target, swing) => {
		const humanoid = target.FindFirstChildOfClass("Humanoid");
		if (humanoid && humanoid.Health > 0) {
			humanoid.TakeDamage(DAMAGE[swing as keyof typeof SWINGS]);
		}
	},
});

hitboxes.trackPlayers();

const npcs = Workspace.WaitForChild("NPCs");
for (const npc of npcs.GetChildren()) {
	if (npc.IsA("Model")) {
		hitboxes.track(npc);
	}
}
npcs.ChildAdded.Connect((npc) => {
	if (npc.IsA("Model")) {
		hitboxes.track(npc);
	}
});
npcs.ChildRemoved.Connect((npc) => {
	if (npc.IsA("Model")) {
		hitboxes.untrack(npc);
	}
});
