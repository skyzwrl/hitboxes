import { boxesOverlap, sphereOverlapsBox } from "./geometry";

export interface BoxShape {
	readonly kind: "box";
	readonly offset: CFrame;
	readonly size: Vector3;
}

export interface SphereShape {
	readonly kind: "sphere";
	readonly center: Vector3;
	readonly radius: number;
}

// offsets are relative to the attacker's root, -Z is forward like any CFrame
export type HitboxShape = BoxShape | SphereShape;

export function box(size: Vector3, offset = CFrame.identity): BoxShape {
	if (size.X <= 0 || size.Y <= 0 || size.Z <= 0) {
		throw `box size must be positive on every axis, got ${size}`;
	}
	return { kind: "box", offset, size };
}

export function sphere(radius: number, center = Vector3.zero): SphereShape {
	if (radius <= 0) {
		throw `sphere radius must be positive, got ${radius}`;
	}
	return { kind: "sphere", center, radius };
}

// furthest any point of the shape gets from the root
export function shapeReach(shape: HitboxShape): number {
	if (shape.kind === "box") {
		return shape.offset.Position.Magnitude + shape.size.Magnitude / 2;
	}
	return shape.center.Magnitude + shape.radius;
}

// half the thinnest dimension, the largest step a sweep can take without skipping through
export function shapeThickness(shape: HitboxShape): number {
	if (shape.kind === "box") {
		return math.min(shape.size.X, shape.size.Y, shape.size.Z) / 2;
	}
	return shape.radius;
}

export function shapeOverlapsBox(
	shape: HitboxShape,
	root: CFrame,
	target: CFrame,
	targetSize: Vector3,
	tolerance = 0,
): boolean {
	if (shape.kind === "box") {
		return boxesOverlap(root.mul(shape.offset), shape.size, target, targetSize, tolerance);
	}
	return sphereOverlapsBox(root.PointToWorldSpace(shape.center), shape.radius + tolerance, target, targetSize);
}
