self.onmessage = function(e) {
    const { playerPos, stalkerPos, mazeData, unit } = e.data;
    
    if (!mazeData || !mazeData.length) {
        self.postMessage({ dirX: 0, dirZ: 0, dist: 0 });
        return;
    }

    const sX = Math.floor(stalkerPos.x / unit + 0.5);
    const sZ = Math.floor(stalkerPos.z / unit + 0.5);
    const pX = Math.floor(playerPos.x / unit + 0.5);
    const pZ = Math.floor(playerPos.z / unit + 0.5);

    const mazeSize = mazeData.length;

    const dx = playerPos.x - stalkerPos.x;
    const dz = playerPos.z - stalkerPos.z;
    const directDist = Math.sqrt(dx*dx + dz*dz);

    if (sX < 0 || sX >= mazeSize || sZ < 0 || sZ >= mazeSize || 
        pX < 0 || pX >= mazeSize || pZ < 0 || pZ >= mazeSize) {
        if (directDist > 0) {
            self.postMessage({ dirX: dx/directDist, dirZ: dz/directDist, dist: directDist });
        } else {
            self.postMessage({ dirX: 0, dirZ: 0, dist: 0 });
        }
        return;
    }

    // A* Pathfinding
    const queue = [{ x: sX, z: sZ, path: [] }];
    const visited = new Set();
    visited.add(`${sX},${sZ}`);
    
    let nextStep = null;
    let found = false;

    // Breadth-first search for stability on grids
    while (queue.length > 0) {
        const curr = queue.shift();
        
        if (curr.x === pX && curr.z === pZ) {
            found = true;
            if (curr.path.length > 0) {
                nextStep = curr.path[0];
            } else {
                nextStep = { x: pX, z: pZ };
            }
            break;
        }

        const dirs = [ [0,1], [1,0], [0,-1], [-1,0] ];
        // Randomize directions slightly to prevent deterministic getting stuck
        dirs.sort(() => Math.random() - 0.5);

        for (const [dirX, dirZ] of dirs) {
            const nx = curr.x + dirX;
            const nz = curr.z + dirZ;
            
            if (nx >= 0 && nx < mazeSize && nz >= 0 && nz < mazeSize) {
                if (mazeData[nx][nz] === 0 && !visited.has(`${nx},${nz}`)) {
                    visited.add(`${nx},${nz}`);
                    queue.push({ x: nx, z: nz, path: [...curr.path, { x: nx, z: nz }] });
                }
            }
        }
    }

    let dirX = 0;
    let dirZ = 0;

    if (nextStep) {
        const targetX = nextStep.x * unit;
        const targetZ = nextStep.z * unit;
        
        const sx = targetX - stalkerPos.x;
        const sz = targetZ - stalkerPos.z;
        const distToNext = Math.sqrt(sx*sx + sz*sz);
        
        if (distToNext > 0.1) {
            dirX = sx / distToNext;
            dirZ = sz / distToNext;
        } else {
            // we are exactly at the next step, move directly towards player briefly to prevent stutter
            if (directDist > 0) {
                dirX = dx / directDist;
                dirZ = dz / directDist;
            }
        }
    } else {
        // No path, move directly or random bounce avoiding walls ideally
        if (directDist > 0) {
            dirX = dx / directDist;
            dirZ = dz / directDist;
        }
    }

    self.postMessage({ dirX, dirZ, dist: directDist });
};
