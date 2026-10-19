import { HitboxShape, shapeOverlapsBox, shapeReach, shapeThickness } from "./shapes";

const MAX_STEPS = 16;

function rotationAngle(from: CFrame, to: CFrame): number {
	const [, , , f00, f01, f02, f10, f11, f12, f20, f21, f22] = from.GetComponents();
	const [, , , t00, t01, t02, t10, t11, t12, t20, t21, t22] = to.GetComponents();
	// trace of the relative rotation is 1 + 2cos(angle)
	const trace =
		f00 * t00 + f01 * t01 + f02 * t02 + f10 * t10 + f11 * t11 + f12 * t12 + f20 * t20 + f21 * t21 + f22 * t22;
	return math.acos(math.clamp((trace - 1) / 2, -1, 1));
}

// alpha (between fromAlpha and toAlpha) where the shape first touches the target while both move
// from their "from" pose to their "to" pose, so a fast swing can't skip through a thin target
export function sweepShape(
	shape: HitboxShape,
	rootFrom: CFrame,
	rootTo: CFrame,
	targetFrom: CFrame,
	targetTo: CFrame,
	targetSize: Vector3,
	tolerance = 0,
	fromAlpha = 0,
	toAlpha = 1,
): number | undefined {
	const shapeTravel =
		rootFrom.Position.sub(rootTo.Position).Magnitude + rotationAngle(rootFrom, rootTo) * shapeReach(shape);
	const targetTravel =
		targetFrom.Position.sub(targetTo.Position).Magnitude +
		(rotationAngle(targetFrom, targetTo) * targetSize.Magnitude) / 2;

	// stepping by at most the combined half thickness means neither can jump clean over the other
	const stride = shapeThickness(shape) + math.min(targetSize.X, targetSize.Y, targetSize.Z) / 2 + tolerance;
	const span = toAlpha - fromAlpha;
	const steps = math.clamp(math.ceil(((shapeTravel + targetTravel) * span) / stride), 1, MAX_STEPS);

	for (const step of $range(0, steps)) {
		const alpha = fromAlpha + (span * step) / steps;
		if (
			shapeOverlapsBox(
				shape,
				rootFrom.Lerp(rootTo, alpha),
				targetFrom.Lerp(targetTo, alpha),
				targetSize,
				tolerance,
			)
		) {
			return alpha;
		}
	}
	return undefined;
}
