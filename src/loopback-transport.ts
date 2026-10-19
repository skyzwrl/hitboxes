import { ClientTransport, HitClaim, HitResult, ServerTransport, SwingRejection, SwingStart } from "./messages";

// in memory transport for tests and local simulation, nothing arrives until flush is called
export interface LoopbackTransport {
	readonly server: ServerTransport;
	client(player: Player): ClientTransport;
	flush(): void;
}

function subscribe<T>(handlers: Set<T>, handler: T): () => void {
	handlers.add(handler);
	return () => {
		handlers.delete(handler);
	};
}

function handlersOf<K, T>(map: Map<K, Set<T>>, key: K): Set<T> {
	let handlers = map.get(key);
	if (!handlers) {
		handlers = new Set();
		map.set(key, handlers);
	}
	return handlers;
}

export function createLoopbackTransport(): LoopbackTransport {
	const queue = new Array<() => void>();
	const swingHandlers = new Set<(player: Player, start: SwingStart) => void>();
	const claimHandlers = new Set<(player: Player, claim: HitClaim) => void>();
	const resultHandlers = new Map<Player, Set<(result: HitResult) => void>>();
	const rejectionHandlers = new Map<Player, Set<(rejection: SwingRejection) => void>>();

	const server: ServerTransport = {
		onSwing(handler) {
			return subscribe(swingHandlers, handler);
		},

		onClaim(handler) {
			return subscribe(claimHandlers, handler);
		},

		sendHitResult(player, result) {
			queue.push(() => {
				for (const handler of handlersOf(resultHandlers, player)) handler(result);
			});
		},

		sendSwingRejection(player, rejection) {
			queue.push(() => {
				for (const handler of handlersOf(rejectionHandlers, player)) handler(rejection);
			});
		},
	};

	return {
		server,

		client(player) {
			return {
				sendSwing(start) {
					queue.push(() => {
						for (const handler of swingHandlers) handler(player, start);
					});
				},

				sendClaim(claim) {
					queue.push(() => {
						for (const handler of claimHandlers) handler(player, claim);
					});
				},

				onHitResult(handler) {
					return subscribe(handlersOf(resultHandlers, player), handler);
				},

				onSwingRejection(handler) {
					return subscribe(handlersOf(rejectionHandlers, player), handler);
				},
			};
		},

		flush() {
			// replies sent while delivering join the end of the queue and go out in this flush too. a plain
			// for loop compiles to a numeric for that reads the length once and would skip them
			let index = 0;
			while (index < queue.size()) {
				queue[index]();
				index += 1;
			}
			queue.clear();
		},
	};
}
