var async = require('async');

function crossProduct(u, v) {
    var cp = [
            u[1]*v[2] - u[2]*v[1],
            u[2]*v[0] - u[0]*v[2],
            u[0]*v[1] - u[1]*v[0]
        ],
        l = Math.sqrt(cp[0]*cp[0]+cp[1]*cp[1]+cp[2]*cp[2]);

    return [
        cp[0] / l,
        cp[1] / l,
        cp[2] / l
    ];
}

function vectorAdd(u, v) {
    return [
        u[0]+v[0],
        u[1]+v[1],
        u[2]+v[2]
    ];
}

function vectorSub(u, v) {
    return [
        u[0]-v[0],
        u[1]-v[1],
        u[2]-v[2]
    ];
}

var neighbourTris = [
    [
        [1, 0],
        [1, 1]
    ],
    [
        [0, 1],
        [-1, 1]
    ],
    [
        [-1, 0],
        [-1, -1],
    ],
    [
        [0, -1],
        [1, -1]
    ]
];

module.exports = function(stream, proj, bounds, tileSet) {
    var llbounds = bounds.map(function(ll) { return proj.inverse(ll); }),
        sw = llbounds.reduce(function(sw, ll) {
            return ll.map(function(c, i) {
                return Math.round(Math.min(sw[i], c) * 3600) / 3600;
            });
        }),
        ne = llbounds.reduce(function(ne, ll) {
            return ll.map(function(c, i) {
                return Math.round(Math.max(ne[i], c) * 3600) / 3600;
            });
        }),
        step = 1 / 3600,
        rows = Math.floor((ne[1] - sw[1]) / step + 1),
        cols = Math.floor((ne[0] - sw[0]) / step + 1),
        lls = new Array(rows * cols),
        lat = sw[1],
        i = 0,
        lng;

    stream.write('# Created with hgt2obj\n');
    stream.write('# Projection: ' + proj.defs + '\n');
    stream.write('# Bounds: ' + JSON.stringify(llbounds) + '\n');
    stream.write('# Projected bounds: ' + JSON.stringify(bounds) + '\n');
    stream.write('# ' + rows + ' rows, ' + cols + ' cols\n');
    stream.write('# ' + (rows * cols) + ' vertices\n');

    for (var row = 0; row < rows; row++) {
        lng = sw[0];
        for (var col = 0; col < cols; col++) {
            lls[i++] = [lng, lat];
            lng += step;
        }

        lat += step;
    }

    async.map(lls, function(ll, cb) {
        tileSet.getElevation([ll[1], ll[0]], cb);
    }, function(err, heights) {
        var i,
            j;
        if (err) {
            return;
        }

        var vertex = 0,
            vertices = new Array(rows * cols);
        for (i = 0; i < rows; i++) {
            for (j = 0; j < cols; j++) {
                var c = proj.forward(lls[vertex]);
                vertices[vertex] = [c[1], heights[vertex], c[0]];
                vertex++;
            }
        }

        vertex = 0;
        for (i = 0; i < rows; i++) {
            for (j = 0; j < cols; j++) {
                var ns = neighbourTris.filter(function(tri) {
                        var r1 = i + tri[0][0],
                            c1 = j + tri[0][1],
                            r2 = i + tri[1][0],
                            c2 = j + tri[1][1];
                        return r1 >=0 && r1 < rows && c1 >= 0 && c1 < cols &&
                            r2 >=0 && r2 < rows && c2 >= 0 && c2 < cols;
                    }).map(function(tri) {
                        var v1 = vertex + tri[0][0] * cols + tri[0][1],
                            v2 = vertex + tri[1][0] * cols + tri[1][1],
                            vec1 = vectorSub(vertices[v1], vertices[vertex]),
                            vec2 = vectorSub(vertices[v2], vertices[vertex]);

                        return crossProduct(vec1, vec2);
                    }),
                    avgNs = ns.reduce(vectorAdd);
                stream.write('v ' + vertices[vertex].join(' ') + '\n');
                stream.write('vn ' + avgNs.join(' ') + '\n');
                vertex++;
            }
        }

        for (i = 0; i < rows - 1; i++) {
            for (j = 0; j < cols - 1 ; j++) {
                vertex = i * cols + j + 1;
                stream.write('f ' + vertex + ' ' + (vertex + cols) + ' ' + (vertex + cols + 1) + '\n');
                stream.write('f ' + vertex + ' ' + (vertex + cols + 1) + ' ' + (vertex + 1) + '\n');
            }
        }
    });

};
