package main

import (
	"fmt"
	"math"

	pb "coffee-canvas/physics-service/proto"
)

// fluidThreshold is the minimum cell volume to be considered part of a stain contour.
const fluidThreshold = 0.5

// marchingSquaresTable maps the 16 marching squares cases to edge intersection pairs.
// Each entry is a list of edge index pairs forming line segments.
var marchingSquaresTable = [16][][2]int{
	{},                     // 0000
	{{2, 3}},               // 0001
	{{1, 2}},               // 0010
	{{1, 3}},               // 0011
	{{0, 1}},               // 0100
	{{0, 3}, {1, 2}},       // 0101 (ambiguous)
	{{0, 2}},               // 0110
	{{0, 3}},               // 0111
	{{0, 3}},               // 1000
	{{0, 2}},               // 1001
	{{0, 1}, {2, 3}},       // 1010 (ambiguous)
	{{0, 1}},               // 1011
	{{1, 3}},               // 1100
	{{1, 2}},               // 1101
	{{2, 3}},               // 1110
	{},                     // 1111
}

// ExtractStainPolygons runs marching squares on the fluid grid and returns stain polygons.
func ExtractStainPolygons(grid *SimGrid, initialVolume float64) []*pb.StainPolygon {
	g := grid.Cells
	sizeX := grid.SizeX
	sizeY := grid.SizeY

	// Collect all edge segments produced by marching squares
	type edge struct{ x0, y0, x1, y1 float64 }
	var edges []edge

	for x := 0; x < sizeX-1; x++ {
		for y := 0; y < sizeY-1; y++ {
			// The four corners of the current cell square
			v00 := g[x][y].Volume
			v10 := g[x+1][y].Volume
			v01 := g[x][y+1].Volume
			v11 := g[x+1][y+1].Volume

			// Build the 4-bit case index
			idx := 0
			if v00 >= fluidThreshold {
				idx |= 8
			}
			if v10 >= fluidThreshold {
				idx |= 4
			}
			if v11 >= fluidThreshold {
				idx |= 2
			}
			if v01 >= fluidThreshold {
				idx |= 1
			}

			// World coordinates of the corners
			wx := grid.OriginX + float64(x)*grid.CellSize
			wy := grid.OriginY + float64(y)*grid.CellSize
			wStep := grid.CellSize

			// Edge midpoints (0=top, 1=right, 2=bottom, 3=left)
			edgeMidX := [4]float64{
				wx + wStep*0.5, // top
				wx + wStep,     // right
				wx + wStep*0.5, // bottom
				wx,             // left
			}
			edgeMidY := [4]float64{
				wy,             // top
				wy + wStep*0.5, // right
				wy + wStep,     // bottom
				wy + wStep*0.5, // left
			}

			for _, pair := range marchingSquaresTable[idx] {
				e0, e1 := pair[0], pair[1]
				edges = append(edges, edge{
					x0: edgeMidX[e0], y0: edgeMidY[e0],
					x1: edgeMidX[e1], y1: edgeMidY[e1],
				})
			}
		}
	}

	if len(edges) == 0 {
		return nil
	}

	// Chain edges into polylines using a simple greedy chain builder
	chains := chainEdges(edges)

	var polygons []*pb.StainPolygon
	for i, chain := range chains {
		if len(chain) < 3 {
			continue
		}
		pts := make([]*pb.Point2D, len(chain))
		for j, p := range chain {
			pts[j] = &pb.Point2D{X: float32(p[0]), Y: float32(p[1])}
		}

		// Estimate polygon area to compute opacity
		area := polygonArea(chain)
		opacity := opacityForArea(area, initialVolume)

		polygons = append(polygons, &pb.StainPolygon{
			Id:      fmt.Sprintf("stain-%d", i),
			Path:    pts,
			Opacity: float32(opacity),
			Color:   coffeeColor,
		})
	}

	return polygons
}

// chainEdges connects raw marching squares edges into closed or open polylines.
func chainEdges(edges []struct{ x0, y0, x1, y1 float64 }) [][][2]float64 {
	type pt = [2]float64
	type seg struct{ a, b pt }

	segs := make([]seg, len(edges))
	for i, e := range edges {
		segs[i] = seg{pt{e.x0, e.y0}, pt{e.x1, e.y1}}
	}

	used := make([]bool, len(segs))
	var chains [][][2]float64

	for start := 0; start < len(segs); start++ {
		if used[start] {
			continue
		}
		chain := []pt{segs[start].a, segs[start].b}
		used[start] = true

		for {
			tail := chain[len(chain)-1]
			found := false
			for j := 0; j < len(segs); j++ {
				if used[j] {
					continue
				}
				if ptClose(segs[j].a, tail) {
					chain = append(chain, segs[j].b)
					used[j] = true
					found = true
					break
				}
				if ptClose(segs[j].b, tail) {
					chain = append(chain, segs[j].a)
					used[j] = true
					found = true
					break
				}
			}
			if !found {
				break
			}
		}
		chains = append(chains, chain)
	}
	return chains
}

func ptClose(a, b [2]float64) bool {
	const eps = 0.5
	return math.Abs(a[0]-b[0]) < eps && math.Abs(a[1]-b[1]) < eps
}

// polygonArea computes the signed area of a polygon using the shoelace formula.
func polygonArea(pts [][2]float64) float64 {
	n := len(pts)
	area := 0.0
	for i := 0; i < n; i++ {
		j := (i + 1) % n
		area += pts[i][0] * pts[j][1]
		area -= pts[j][0] * pts[i][1]
	}
	return math.Abs(area) / 2.0
}

// opacityForArea maps a polygon area to a stain opacity value in [0.1, 0.9].
func opacityForArea(area, initialVolume float64) float64 {
	if initialVolume <= 0 {
		return 0.3
	}
	ratio := area / (initialVolume * 10)
	return math.Max(0.1, math.Min(0.9, ratio))
}

// --- Stroke Mutation Calculations ---

// ComputeStrokeMutations builds the list of stroke mutations from absorbed volume data.
func ComputeStrokeMutations(nearby []*pb.StrokeSnapshot, absorbed map[string]float64) []*pb.StrokeMutation {
	var mutations []*pb.StrokeMutation
	for _, stroke := range nearby {
		vol, ok := absorbed[stroke.StrokeId]
		if !ok || vol < 0.01 {
			continue
		}

		// Absorption factor in [0,1] relative to a "full absorption" reference
		factor := math.Min(vol/10.0, 1.0)

		colorShift := interpolateTowardsCoffee(stroke.Color, factor)
		blurFactor := float32(factor * 2.5)
		opacityDelta := float32(-0.1 * factor)

		mutations = append(mutations, &pb.StrokeMutation{
			StrokeId:     stroke.StrokeId,
			ColorShift:   colorShift,
			BlurFactor:   blurFactor,
			OpacityDelta: opacityDelta,
		})
	}
	return mutations
}

// interpolateTowardsCoffee blends a stroke's hex color toward the coffee brown.
func interpolateTowardsCoffee(strokeColor string, factor float64) string {
	// Coffee brown target: #6F4E37
	targetR, targetG, targetB := uint8(0x6F), uint8(0x4E), uint8(0x37)

	var r, g, b uint8
	if len(strokeColor) == 7 && strokeColor[0] == '#' {
		r = hexByte(strokeColor[1:3])
		g = hexByte(strokeColor[3:5])
		b = hexByte(strokeColor[5:7])
	}

	nr := uint8(float64(r) + factor*(float64(targetR)-float64(r)))
	ng := uint8(float64(g) + factor*(float64(targetG)-float64(g)))
	nb := uint8(float64(b) + factor*(float64(targetB)-float64(b)))

	return fmt.Sprintf("#%02X%02X%02X", nr, ng, nb)
}
