import { Fiber } from "./ReactInternalTypes";

export type BatchConfigTransition = {
    name?: string,
    startTime?: number,
    _updatedFibers?: Set<Fiber>,
  };
  