
// 3D 25 0A 80 => Number( `0x0A253D` )
export function PSXPointerToOffset( PSX_MEM: Buffer, slice: Buffer | number ): number {
    if ( typeof slice === 'number' ) {
        slice = Buffer.from( slice.toString( 16 ) )
    }

    return Number( `0x${slice.swap32().toString( 'hex', 1, 4 )}` )
}

export function dereferencePSXPointer( PSX_MEM: Buffer, offset: number ): number {
    return PSXPointerToOffset( PSX_MEM, PSX_MEM.slice( offset, offset + 4 ) )
}