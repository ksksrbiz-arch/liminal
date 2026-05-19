self.onmessage = function(e) {
    const { playerPos, stalkerPos, mazeSize, unit, mazeData } = e.data;
    // Real A* Pathfinding could go here
    const dirX = playerPos.x - stalkerPos.x;
    const dirZ = playerPos.z - stalkerPos.z;
    const dist = Math.sqrt(dirX*dirX + dirZ*dirZ);
    if (dist > 0 && dist < 50) {
        self.postMessage({
            dirX: dirX / dist,
            dirZ: dirZ / dist,
            dist: dist
        });
    } else {
        self.postMessage({ dirX: 0, dirZ: 0, dist: dist });
    }
}
