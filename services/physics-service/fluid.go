package main

import (
	"math"

	pb "coffee-canvas/physics-service/proto"
)

// coffeeColor is the base stain color in hex (a warm brown).
const coffeeColor = "#6F4E37"

// FluidCell represents a single cell in the simulation grid.
type FluidCell struct {
	Volume   float64
	Color    string
	Absorbed float64 // total volume absorbed by strokes in this cell
}

// StrokeCell records absorption metadata for a stroke-occupied grid cell.
type StrokeCell struct {
	StrokeID       string
	AbsorptionRate float64
}

// SimGrid is the 2D simulation grid anchored to world coordinates.
type SimGrid struct {
	Cells          [][]FluidCell
	StrokeCells    map[[2]int]StrokeCell
	SizeX, SizeY   int
	OriginX        float64
	OriginY        float64
	CellSize       float64
	TotalAbsorbed  float64
}

// SimResult carries the output of a completed simulation run.
type SimResult struct {
	Grid           *SimGrid
	MutatedStrokes map[string]float64 // strokeID -> total absorbed volume
	InitialVolume  float64
}

// NewSimGrid allocates a grid centered around the pour origin.
func NewSimGrid(origin *pb.Point2D, intensity float64) *SimGrid {
	// Grid extends radius cells in each direction; cell size is fixed at 10 world units.
	cellSize := 10.0
	radius := int(math.Ceil(intensity*20)) + 10
	size := 2*radius + 1

	cells := make([][]FluidCell, size)
	for i := range cells {
		cells[i] = make([]FluidCell, size)
	}

	return &SimGrid{
		Cells:       cells,
		StrokeCells: make(map[[2]int]StrokeCell),
		SizeX:       size,
		SizeY:       size,
		OriginX:     float64(origin.X) - float64(radius)*cellSize,
		OriginY:     float64(origin.Y) - float64(radius)*cellSize,
		CellSize:    cellSize,
	}
}

// worldToGrid converts world coordinates to grid cell indices. Returns false if out of bounds.
func (g *SimGrid) worldToGrid(wx, wy float64) (int, int, bool) {
	cx := int((wx - g.OriginX) / g.CellSize)
	cy := int((wy - g.OriginY) / g.CellSize)
	if cx < 0 || cx >= g.SizeX || cy < 0 || cy >= g.SizeY {
		return 0, 0, false
	}
	return cx, cy, true
}

// markStrokes rasterizes nearby strokes onto the grid, setting absorption rates per cell.
func (g *SimGrid) markStrokes(strokes []*pb.StrokeSnapshot) {
	for _, stroke := range strokes {
		rate := calculateAbsorptionRate(stroke.Color, float64(stroke.Width))
		pts := stroke.Points
		for i, pt := range pts {
			cx, cy, ok := g.worldToGrid(float64(pt.X), float64(pt.Y))
			if !ok {
				continue
			}
			key := [2]int{cx, cy}
			if _, exists := g.StrokeCells[key]; !exists {
				g.StrokeCells[key] = StrokeCell{
					StrokeID:       stroke.StrokeId,
					AbsorptionRate: rate,
				}
			}
			// Also mark intermediate cells between consecutive points
			if i > 0 {
				prev := pts[i-1]
				g.rasterizeLine(float64(prev.X), float64(prev.Y), float64(pt.X), float64(pt.Y), stroke.StrokeId, rate)
			}
		}
	}
}

// rasterizeLine uses Bresenham's algorithm to fill cells along a line segment.
func (g *SimGrid) rasterizeLine(x0, y0, x1, y1 float64, strokeID string, rate float64) {
	steps := int(math.Max(math.Abs(x1-x0), math.Abs(y1-y0)) / g.CellSize * 2)
	if steps == 0 {
		steps = 1
	}
	for i := 0; i <= steps; i++ {
		t := float64(i) / float64(steps)
		wx := x0 + t*(x1-x0)
		wy := y0 + t*(y1-y0)
		cx, cy, ok := g.worldToGrid(wx, wy)
		if !ok {
			continue
		}
		key := [2]int{cx, cy}
		if _, exists := g.StrokeCells[key]; !exists {
			g.StrokeCells[key] = StrokeCell{StrokeID: strokeID, AbsorptionRate: rate}
		}
	}
}

// calculateAbsorptionRate returns an absorption rate based on stroke color lightness and width.
// Darker, thicker strokes absorb more coffee.
func calculateAbsorptionRate(color string, width float64) float64 {
	// Parse the hex color luminance (simplified: use blue channel as proxy for lightness)
	var r, gv, b uint8
	if len(color) == 7 && color[0] == '#' {
		fmt := color[1:]
		if len(fmt) == 6 {
			r = hexByte(fmt[0:2])
			gv = hexByte(fmt[2:4])
			b = hexByte(fmt[4:6])
		}
	}
	luminance := (0.299*float64(r) + 0.587*float64(gv) + 0.114*float64(b)) / 255.0
	// Darker strokes → higher absorption
	darknessBonus := 1.0 - luminance
	// Width contributes a small multiplier, capped to avoid runaway absorption
	widthFactor := math.Min(float64(width)/20.0, 1.5)
	base := 0.1 + darknessBonus*0.2
	return base * widthFactor
}

// hexByte converts a 2-char hex string to a uint8 value.
func hexByte(s string) uint8 {
	var v uint8
	for _, c := range s {
		v <<= 4
		switch {
		case c >= '0' && c <= '9':
			v |= uint8(c - '0')
		case c >= 'a' && c <= 'f':
			v |= uint8(c-'a') + 10
		case c >= 'A' && c <= 'F':
			v |= uint8(c-'A') + 10
		}
	}
	return v
}

// RunSimulation executes the cellular automaton fluid simulation and returns the result.
func RunSimulation(req *pb.PourRequest) *SimResult {
	grid := NewSimGrid(req.Origin, float64(req.Intensity))
	grid.markStrokes(req.NearbyStrokes)

	intensity := float64(req.Intensity)
	viscosity := float64(req.Viscosity)
	if viscosity <= 0 {
		viscosity = 0.5
	}
	steps := int(req.SimulationSteps)
	if steps <= 0 {
		steps = 60
	}
	steps = clampInt(steps, 1, 120)

	// Initial volume placed at the center of the grid
	initialVolume := intensity * 100.0
	cx, cy := grid.SizeX/2, grid.SizeY/2
	grid.Cells[cx][cy].Volume = initialVolume
	grid.Cells[cx][cy].Color = coffeeColor

	mutated := make(map[string]float64) // strokeID -> absorbed volume

	for step := 0; step < steps; step++ {
		next := make([][]FluidCell, grid.SizeX)
		for i := range next {
			next[i] = make([]FluidCell, grid.SizeY)
			copy(next[i], grid.Cells[i])
		}

		dirs := [][2]int{{1, 0}, {-1, 0}, {0, 1}, {0, -1}}
		for x := 0; x < grid.SizeX; x++ {
			for y := 0; y < grid.SizeY; y++ {
				cell := grid.Cells[x][y]
				if cell.Volume < 0.01 {
					continue
				}

				key := [2]int{x, y}
				if sc, occupied := grid.StrokeCells[key]; occupied {
					// Absorbed by stroke
					absorb := sc.AbsorptionRate * cell.Volume
					absorb = math.Min(absorb, cell.Volume)
					next[x][y].Volume -= absorb
					next[x][y].Absorbed += absorb
					grid.TotalAbsorbed += absorb
					mutated[sc.StrokeID] += absorb
					continue
				}

				// Spread to neighbors based on viscosity
				spreadFraction := (1.0 - viscosity) * 0.25
				spreadTotal := 0.0
				for _, d := range dirs {
					nx, ny := x+d[0], y+d[1]
					if nx < 0 || nx >= grid.SizeX || ny < 0 || ny >= grid.SizeY {
						continue
					}
					if _, occupied := grid.StrokeCells[[2]int{nx, ny}]; occupied {
						continue
					}
					amount := cell.Volume * spreadFraction
					next[nx][ny].Volume += amount
					if next[nx][ny].Color == "" {
						next[nx][ny].Color = coffeeColor
					}
					spreadTotal += amount
				}
				next[x][y].Volume -= spreadTotal
			}
		}

		// Apply gravity bias (fluid flows downward in y+)
		for x := 0; x < grid.SizeX; x++ {
			for y := 0; y < grid.SizeY-1; y++ {
				grav := next[x][y].Volume * 0.02
				next[x][y].Volume -= grav
				next[x][y+1].Volume += grav
			}
		}

		grid.Cells = next

		// Early exit if fluid is fully absorbed or negligible
		totalVolume := 0.0
		for x := 0; x < grid.SizeX; x++ {
			for y := 0; y < grid.SizeY; y++ {
				totalVolume += grid.Cells[x][y].Volume
			}
		}
		_ = step // Use step to avoid unused var warning
		if totalVolume < 0.01 {
			break
		}
	}

	return &SimResult{
		Grid:           grid,
		MutatedStrokes: mutated,
		InitialVolume:  initialVolume,
	}
}

func clampInt(v, min, max int) int {
	if v < min {
		return min
	}
	if v > max {
		return max
	}
	return v
}
