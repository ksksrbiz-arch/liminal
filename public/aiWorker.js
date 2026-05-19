self.onmessage = function(e) {
    const { playerPos, stalkerPos, mazeData, unit } = e.data;
    
    // Idempotent Fallbacks
    if (!mazeData || !unit) {
        const dirX = playerPos.x - stalkerPos.x;
        const dirZ = playerPos.z - stalkerPos.z;
        const dist = Math.hypot(dirX, dirZ) || 1;
        self.postMessage({ dirX: dirX / dist, dirZ: dirZ / dist, dist: dist });
        return;
    }
    
    const mapWidth = mazeData.length;
    const mapHeight = mazeData[0].length;

    // Constrain positions to grid validity range mathematically
    const clamp = (val, min, max) => Math.max(min, Math.min(max, val));
    const startX = clamp(Math.floor(stalkerPos.x / unit), 0, mapWidth - 1);
    const startY = clamp(Math.floor(stalkerPos.z / unit), 0, mapHeight - 1);
    const goalX = clamp(Math.floor(playerPos.x / unit), 0, mapWidth - 1);
    const goalY = clamp(Math.floor(playerPos.z / unit), 0, mapHeight - 1);

    // Euclidean distance heuristic
    function heuristic(ax, ay, bx, by) {
        return Math.hypot(ax - bx, ay - by);
    }
    
    const openSet = [{ x: startX, y: startY, f: 0, g: 0, parent: null }];
    const closedSet = new Set();
    
    while (openSet.length > 0) {
        openSet.sort((a, b) => a.f - b.f);
        const current = openSet.shift();
        
        if (current.x === goalX && current.y === goalY) {
            let step = current;
            while (step.parent && (step.parent.x !== startX || step.parent.y !== startY)) {
                step = step.parent;
            }
            
            if (step.x === startX && step.y === startY) {
                const dx = playerPos.x - stalkerPos.x;
                const dz = playerPos.z - stalkerPos.z;
                const d = Math.hypot(dx, dz) || 1;
                self.postMessage({ dirX: dx/d, dirZ: dz/d, dist: d });
                return;
            }
            
            const nextX = step.x * unit + (unit / 2.0);
            const nextZ = step.y * unit + (unit / 2.0);
            
            // Mathematically precise vector to next node
            let dirX = nextX - stalkerPos.x;
            let dirZ = nextZ - stalkerPos.z;
            const distToNode = Math.hypot(dirX, dirZ) || 1.0;
            
            let normX = dirX / distToNode;
            let normZ = dirZ / distToNode;
            
            // Catmull-Rom like vector smoothing towards future node
            if (distToNode < unit * 0.8 && step.parent) {
                const nnextX = step.parent.x * unit + (unit / 2.0);
                const nnextZ = step.parent.y * unit + (unit / 2.0);
                const ndx = nnextX - stalkerPos.x;
                const ndz = nnextZ - stalkerPos.z;
                const ndist = Math.hypot(ndx, ndz) || 1.0;
                
                // Weight vector blending by proximity to the current target node
                const blendFactor = Math.pow(1.0 - (distToNode / (unit * 0.8)), 2.0);
                normX = normX * (1.0 - blendFactor) + (ndx / ndist) * blendFactor;
                normZ = normZ * (1.0 - blendFactor) + (ndz / ndist) * blendFactor;
                
                const finalLen = Math.hypot(normX, normZ);
                normX /= finalLen;
                normZ /= finalLen;
            }
            
            const totalDist = Math.hypot(playerPos.x - stalkerPos.x, playerPos.z - stalkerPos.z);
            self.postMessage({ dirX: normX, dirZ: normZ, dist: totalDist });
            return;
        }
        
        closedSet.add(`${current.x},${current.y}`);
        
        const neighbors = [
            { x: current.x, y: current.y - 1 },
            { x: current.x, y: current.y + 1 },
            { x: current.x - 1, y: current.y },
            { x: current.x + 1, y: current.y },
            // Add diagonal checks with wall occlusion
            { x: current.x - 1, y: current.y - 1 },
            { x: current.x + 1, y: current.y - 1 },
            { x: current.x - 1, y: current.y + 1 },
            { x: current.x + 1, y: current.y + 1 }
        ];
        
        for (const n of neighbors) {
            if (n.x >= 0 && n.x < mapWidth && n.y >= 0 && n.y < mapHeight) {
                if (mazeData[n.x][n.y] === 0 && !closedSet.has(`${n.x},${n.y}`)) {
                    
                    // Check diagonal occlusion (don't squeeze through solid corners)
                    let isDiagonal = (n.x !== current.x && n.y !== current.y);
                    if (isDiagonal) {
                        if (mazeData[current.x][n.y] !== 0 || mazeData[n.x][current.y] !== 0) continue;
                    }

                    const cost = isDiagonal ? 1.414 : 1.0;
                    const gCost = current.g + cost;
                    
                    const existingNode = openSet.find(o => o.x === n.x && o.y === n.y);
                    if (!existingNode || gCost < existingNode.g) {
                        const h = heuristic(n.x, n.y, goalX, goalY);
                        const newNode = { x: n.x, y: n.y, g: gCost, f: gCost + h, parent: current };
                        if (!existingNode) openSet.push(newNode);
                        else {
                            existingNode.g = newNode.g;
                            existingNode.f = newNode.f;
                            existingNode.parent = newNode.parent;
                        }
                    }
                }
            }
        }
    }
    
    // No path found (idempotent fallback)
    const dx = playerPos.x - stalkerPos.x;
    const dz = playerPos.z - stalkerPos.z;
    const d = Math.hypot(dx, dz) || 1;
    self.postMessage({ dirX: dx/d, dirZ: dz/d, dist: d });
};
