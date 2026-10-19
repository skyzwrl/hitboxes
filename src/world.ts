import { Workspace } from "@rbxts/services";

export type Clock = () => number;
export type PoseReader = (model: Model) => CFrame | undefined;

export interface FrameSignal {
	Connect(callback: (deltaTime: number) => void): { Disconnect(): void };
}

// box hit on the target, relative to its root
export interface Hurtbox {
	readonly offset: CFrame;
	readonly size: Vector3;
}

// roughly an R15 character around its HumanoidRootPart
export const DEFAULT_HURTBOX: Hurtbox = {
	offset: new CFrame(0, -0.25, 0),
	size: new Vector3(4, 5.5, 2),
};

export const serverTime: Clock = () => Workspace.GetServerTimeNow();

export const rootPose: PoseReader = (model) => model.PrimaryPart?.CFrame;

export function hurtboxAt(hurtbox: Hurtbox, root: CFrame): CFrame {
	return root.mul(hurtbox.offset);
}
