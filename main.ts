import { parseShip, writeModel } from './parse'
import { parseSaveState } from './sstate'

const saveState = parseSaveState( './sstate.cem' )
const modelParts = parseShip( saveState.PSX_MEM );

writeModel( modelParts, 0.1 )