export type Fsm<S extends string> = { state: S; tick_entered: number };

export const fsm = <S extends string>(initial: S, tick = 0): Fsm<S> => ({
	state: initial,
	tick_entered: tick,
});

export const enter = <S extends string>(f: Fsm<S>, state: S, tick: number): Fsm<S> =>
	f.state === state ? f : { state, tick_entered: tick };

export const since = <S extends string>(f: Fsm<S>, tick: number): number => tick - f.tick_entered;
