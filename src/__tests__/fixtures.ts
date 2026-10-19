import { createLoopbackTransport } from "../loopback-transport";
import { HitboxServer, HitboxServerOptions } from "../server";
import { box } from "../shapes";
import { defineSwing, phase } from "../swing";
import { FrameSignal } from "../world";

// fires listeners in the order they connected, so the server records before the client steps
export class ManualFrame implements FrameSignal {
	private readonly listeners = new Array<(deltaTime: number) => void>();

	public Connect(callback: (deltaTime: number) => void) {
		const listeners = this.listeners;
		listeners.push(callback);
		return {
			Disconnect() {
				const index = listeners.indexOf(callback);
				if (index !== -1) {
					listeners.remove(index);
				}
			},
		};
	}

	public fire(deltaTime: number): void {
		for (const listener of [...this.listeners]) {
			listener(deltaTime);
		}
	}

	public listenerCount(): number {
		return this.listeners.size();
	}
}

// park-miller, products stay well inside double precision
export function seededRandom(seed: number): () => number {
	let state = seed;
	return () => {
		state = (state * 16807) % 2147483647;
		return state / 2147483647;
	};
}

export function dummy(name: string, cframe: CFrame): Model {
	const model = new Instance("Model");
	model.Name = name;

	const root = new Instance("Part");
	root.Name = "HumanoidRootPart";
	root.CFrame = cframe;
	root.Parent = model;
	model.PrimaryPart = root;

	return model;
}

export function moveTo(model: Model, cframe: CFrame): void {
	(model.PrimaryPart as BasePart).CFrame = cframe;
}

// only the identity matters to the code under test, the server reads characters through characterOf
export function fakePlayer(name: string): Player {
	const player = new Instance("Folder");
	player.Name = name;
	return player as unknown as Player;
}

// 4 stud cube three studs in front of the attacker, live from 0.1s to 0.3s
export const JAB = defineSwing({
	duration: 0.5,
	phases: [phase(box(new Vector3(4, 4, 4), new CFrame(0, 0, -3)), 0.1, 0.3)],
});

// attacker at the origin facing -Z, target standing inside the jab
export class Arena {
	public now = 0;
	public readonly frame = new ManualFrame();
	public readonly loopback = createLoopbackTransport();
	public readonly player = fakePlayer("Attacker");
	public readonly attacker = dummy("Attacker", new CFrame());
	public readonly target = dummy("Target", new CFrame(0, 0, -4));
	public readonly hits = new Array<string>();
	public readonly server: HitboxServer;

	public constructor(overrides: Partial<HitboxServerOptions> = {}) {
		this.server = new HitboxServer({
			swings: { jab: JAB },
			transport: this.loopback.server,
			clock: () => this.now,
			frame: this.frame,
			characterOf: (player) => (player === this.player ? this.attacker : undefined),
			viewDelay: () => 0,
			onHit: (_, target, swing, index) => this.hits.push(`${target.Name}:${swing}:${index}`),
			...overrides,
		});
		this.server.track(this.attacker);
		this.server.track(this.target);
	}

	// moves the clock and runs one frame, which records every tracked pose
	public advance(seconds: number): void {
		this.now += seconds;
		this.frame.fire(seconds);
	}
}
