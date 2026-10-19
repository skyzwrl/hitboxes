import { ReplicatedStorage } from "@rbxts/services";
import { ClientTransport, HitClaim, HitResult, ServerTransport, SwingRejection, SwingStart } from "./messages";

const FOLDER_NAME = "Hitboxes";
const MAX_SWING_NAME_LENGTH = 64;

// NaN and infinities both fail the comparison
function isFiniteNumber(value: unknown): value is number {
	return typeIs(value, "number") && math.abs(value) < math.huge;
}

function isWholeNumber(value: unknown): value is number {
	return isFiniteNumber(value) && value >= 0 && value % 1 === 0;
}

// client payloads are untrusted, so they get rebuilt field by field instead of passed through
function readSwingStart(payload: unknown): SwingStart | undefined {
	if (!typeIs(payload, "table")) {
		return undefined;
	}

	const { id, swing, time } = payload as { id?: unknown; swing?: unknown; time?: unknown };
	if (
		!isWholeNumber(id) ||
		!typeIs(swing, "string") ||
		swing.size() > MAX_SWING_NAME_LENGTH ||
		!isFiniteNumber(time)
	) {
		return undefined;
	}
	return { id, swing, time };
}

function readHitClaim(payload: unknown): HitClaim | undefined {
	if (!typeIs(payload, "table")) {
		return undefined;
	}

	const { id, target, phase, time } = payload as { id?: unknown; target?: unknown; phase?: unknown; time?: unknown };
	if (
		!isWholeNumber(id) ||
		!isWholeNumber(phase) ||
		!isFiniteNumber(time) ||
		!typeIs(target, "Instance") ||
		!target.IsA("Model")
	) {
		return undefined;
	}
	return { id, target, phase, time };
}

function createRemote(name: string, parent: Instance): RemoteEvent {
	const remote = new Instance("RemoteEvent");
	remote.Name = name;
	remote.Parent = parent;
	return remote;
}

export function createServerTransport(parent: Instance = ReplicatedStorage, name = FOLDER_NAME): ServerTransport {
	const folder = new Instance("Folder");
	folder.Name = name;
	const swingRemote = createRemote("Swing", folder);
	const claimRemote = createRemote("Claim", folder);
	const resultRemote = createRemote("HitResult", folder);
	const rejectionRemote = createRemote("SwingRejection", folder);
	folder.Parent = parent;

	return {
		onSwing(handler) {
			const connection = swingRemote.OnServerEvent.Connect((player, payload) => {
				const start = readSwingStart(payload);
				if (start) {
					handler(player, start);
				}
			});
			return () => connection.Disconnect();
		},

		onClaim(handler) {
			const connection = claimRemote.OnServerEvent.Connect((player, payload) => {
				const claim = readHitClaim(payload);
				if (claim) {
					handler(player, claim);
				}
			});
			return () => connection.Disconnect();
		},

		sendHitResult(player, result) {
			resultRemote.FireClient(player, result);
		},

		sendSwingRejection(player, rejection) {
			rejectionRemote.FireClient(player, rejection);
		},
	};
}

export function createClientTransport(parent: Instance = ReplicatedStorage, name = FOLDER_NAME): ClientTransport {
	const folder = parent.WaitForChild(name);
	const swingRemote = folder.WaitForChild("Swing") as RemoteEvent;
	const claimRemote = folder.WaitForChild("Claim") as RemoteEvent;
	const resultRemote = folder.WaitForChild("HitResult") as RemoteEvent;
	const rejectionRemote = folder.WaitForChild("SwingRejection") as RemoteEvent;

	return {
		sendSwing(start) {
			swingRemote.FireServer(start);
		},

		sendClaim(claim) {
			claimRemote.FireServer(claim);
		},

		onHitResult(handler) {
			const connection = resultRemote.OnClientEvent.Connect((result: HitResult) => handler(result));
			return () => connection.Disconnect();
		},

		onSwingRejection(handler) {
			const connection = rejectionRemote.OnClientEvent.Connect((rejection: SwingRejection) => handler(rejection));
			return () => connection.Disconnect();
		},
	};
}
