import { createActor, stuff } from './index'

const actor = createActor()
actor.acquire(new stuff.Pen())
actor.acquire(new stuff.MalusPumila())
actor.combine()
actor.acquire(new stuff.Pen())
actor.acquire(new stuff.AnanasComosus())
actor.combine()
actor.recall()
actor.combine()
