import { Players, UserInputService, Workspace } from "@rbxts/services";
import { HitboxClient, createClientTransport } from "@skyzwrl/hitboxes";
import { SWINGS } from "./swings";

const player = Players.LocalPlayer;
const npcs = Workspace.WaitForChild("NPCs");
const SEARCH_RADIUS = 16;

const highlights = new Map<Model, Highlight>();

function nearbyTargets(): Model[] {
	const root = player.Character?.PrimaryPart;
	if (!root) {
		return [];
	}

	const found = new Array<Model>();
	const consider = (model: Instance | undefined) => {
		if (!model || model === player.Character || !model.IsA("Model") || !model.PrimaryPart) {
			return;
		}
		if (model.PrimaryPart.Position.sub(root.Position).Magnitude <= SEARCH_RADIUS) {
			found.push(model);
		}
	};

	for (const other of Players.GetPlayers()) {
		consider(other.Character);
	}
	for (const npc of npcs.GetChildren()) {
		consider(npc);
	}
	return found;
}

function clearHighlight(target: Model) {
	highlights.get(target)?.Destroy();
	highlights.delete(target);
}

const hitboxes = new HitboxClient({
	swings: SWINGS,
	transport: createClientTransport(),
	root: () => player.Character?.PrimaryPart?.CFrame,
	targets: nearbyTargets,

	// shows up the same frame the hit lands, the server answers a round trip later
	onHit: (target) => {
		clearHighlight(target);
		const highlight = new Instance("Highlight");
		highlight.FillColor = Color3.fromRGB(255, 80, 80);
		highlight.Parent = target;
		highlights.set(target, highlight);
		task.delay(0.2, () => {
			if (highlights.get(target) === highlight) {
				clearHighlight(target);
			}
		});
	},

	onUndo: (target) => clearHighlight(target),
});

UserInputService.InputBegan.Connect((input, processed) => {
	if (processed) {
		return;
	}
	if (input.UserInputType === Enum.UserInputType.MouseButton1) {
		hitboxes.swing("jab");
	} else if (input.KeyCode === Enum.KeyCode.E) {
		hitboxes.swing("sweep");
	}
});
