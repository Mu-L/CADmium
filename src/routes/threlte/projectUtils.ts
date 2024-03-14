import {
	workbenchIsStale,
	workbenchIndex,
	workbench,
	project,
	featureIndex,
	wasmProject,
	projectIsStale,
	realizationIsStale,
	wasmRealization,
	realization,
	messageHistory
} from './stores'
import { get } from 'svelte/store'
import { Vector2, Vector3, type Vector2Like } from "three"
import type { Entity, Message, WithTarget, WorkBench } from "../../types"
import type { Realization as WasmRealization } from "cadmium"

const log = (function () {
	const context = "[projectUtils.ts]"
	return Function.prototype.bind.call(console.log, console, `%c${context}`, "font-weight:bold;color:lightblue;")
})()

const DEBUG = true
if (!DEBUG) {
	const methods = ["log", "debug", "warn", "info"]
	for (let i = 0; i < methods.length; i++) {
		// @ts-ignore
		console[methods[i]] = function () { }
	}
}

export const CIRCLE_TOLERANCE = 0.05

export function arraysEqual(a: any[], b: any[]) {
	if (a.length !== b.length) return false
	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i]) return false
	}
	return true
}

function sendWasmMessage(message: Message) {
	let wp = get(wasmProject)
	const messageStr = JSON.stringify(message)
	log("[sendWasmMessage] sending message:", messageStr)
	let reply = wp.send_message(messageStr)
	log("[sendWasmMessage] reply:", reply)
	let result = JSON.parse(reply)
	// log("[sendWasmMessage] result:", result)

	messageHistory.update((history) => {
		log("[sendWasmMessage] messageHistory.update history:", history)
		log("[sendWasmMessage] messageHistory.update update:", { message, result })
		return [...history, { message, result }]
	})
	return result
}

export function updateExtrusion(extrusionId: string, sketchId: string, length: string, faces: string[]) {
	const messageObj: Message = {
		UpdateExtrusion: {
			workbench_id: get(workbenchIndex),
			sketch_id: sketchId,
			face_ids: faces.map((f) => parseInt(f)),
			length: parseFloat(length),
			offset: 0.0,
			extrusion_name: 'Extra',
			direction: 'Normal',
			extrusion_id: extrusionId
		}
	}
	sendWasmMessage(messageObj)
	workbenchIsStale.set(true)
}

export function setSketchPlane(sketchId: string, planeId: string) {
	const messageObj: Message = {
		SetSketchPlane: {
			workbench_id: get(workbenchIndex),
			sketch_id: sketchId,
			plane_id: planeId
		}
	}
	sendWasmMessage(messageObj)
	workbenchIsStale.set(true)
}

export function newSketchOnPlane() {
	const messageObj: Message = {
		NewSketchOnPlane: {
			workbench_id: get(workbenchIndex),
			plane_id: '', // leave it floating at first
			sketch_name: '' // a sensible name will be generated by the rust code
		}
	}
	sendWasmMessage(messageObj)
	workbenchIsStale.set(true)
}

export function newExtrusion() {
	const bench: WorkBench = get(workbench)
	// log("[newExtrusion] workbench:", workbench)
	log("[newExtrusion] bench:", bench)

	let sketchId = null
	for (let step of bench.history) {
		if (step.data.type === 'Sketch') {
			sketchId = step.unique_id
		}
	}
	if (sketchId === null) {
		log("No sketch found in history")
		return
	}

	const messageObj: Message = {
		NewExtrusion: {
			workbench_id: get(workbenchIndex),
			sketch_id: sketchId,
			face_ids: [],
			length: 25,
			offset: 0.0,
			extrusion_name: '',
			direction: 'Normal'
		}
	}
	sendWasmMessage(messageObj)
	workbenchIsStale.set(true)
}

export function deleteEntities(sketchIdx: string, selection: Entity[]) {
	log("[deleteEntities] sketchIdx, selection", sketchIdx, selection)
	const lines = selection.filter((e) => e.type === 'line')
	const arcs = selection.filter((e) => e.type === 'arc')
	const circles = selection.filter((e) => e.type === 'circle')
	// const points = selection.filter((e) => e.type === 'point')
	// log("[deleteEntities] lines, arcs, circles", lines, arcs, circles)

	const workbenchIdx = get(workbenchIndex)
	log("[deleteEntities] workbenchIdx", workbenchIdx)

	deleteLines(
		workbenchIdx,
		sketchIdx,
		lines.map((e) => parseInt(e.id))
	)
	deleteArcs(
		workbenchIdx,
		sketchIdx,
		arcs.map((e) => parseInt(e.id))
	)
	deleteCircles(
		workbenchIdx,
		sketchIdx,
		circles.map((e) => parseInt(e.id))
	)

	// only refresh the workbench once, after all deletions are done
	workbenchIsStale.set(true)
}

function deleteLines(workbenchIdx: number, sketchIdx: string, lineIds: number[]) {
	log("[deleteLines]", workbenchIdx, sketchIdx, lineIds)
	if (lineIds.length === 0) return

	const messageObj: Message = {
		DeleteLines: {
			workbench_id: workbenchIdx,
			sketch_id: sketchIdx,
			line_ids: lineIds
		}
	}
	sendWasmMessage(messageObj)
}

function deleteArcs(workbenchIdx: number, sketchIdx: string, arcIds: number[]) {
	log("[deleteArcs]", workbenchIdx, sketchIdx, arcIds)
	if (arcIds.length === 0) return

	const messageObj: Message = {
		DeleteArcs: {
			workbench_id: workbenchIdx,
			sketch_id: sketchIdx,
			arc_ids: arcIds
		}
	}
	sendWasmMessage(messageObj)
}

function deleteCircles(workbenchIdx: number, sketchIdx: string, circleIds: number[]) {
	if (circleIds.length === 0) return

	const messageObj: Message = {
		DeleteCircles: {
			workbench_id: workbenchIdx,
			sketch_id: sketchIdx,
			circle_ids: circleIds
		}
	}

	sendWasmMessage(messageObj)
}

export function addRectangleBetweenPoints(sketchIdx: string, point1: string, point2: string) {
	// log("[addRectangleBetweenPoints] sketchIdx, point1, point2", sketchIdx, point1, point2)
	const messageObj: Message = {
		NewRectangleBetweenPoints: {
			workbench_id: get(workbenchIndex),
			sketch_id: sketchIdx,
			start_id: parseInt(point1),
			end_id: parseInt(point2)
		}
	}
	sendWasmMessage(messageObj)

	workbenchIsStale.set(true)
}

export function addCircleBetweenPoints(sketchIdx: string, point1: string, point2: string) {
	log("[addCircleBetweenPoints]", "sketchIdx:", sketchIdx, "point1:", point1, "point2", point2)
	const messageObj: Message = {
		NewCircleBetweenPoints: {
			workbench_id: get(workbenchIndex),
			sketch_id: sketchIdx,
			center_id: parseInt(point1),
			edge_id: parseInt(point2)
		}
	}
	sendWasmMessage(messageObj)

	workbenchIsStale.set(true)
}

export function addLineToSketch(sketchIdx: string, point1: string, point2: string) {
	const messageObj: Message = {
		NewLineOnSketch: {
			workbench_id: get(workbenchIndex),
			sketch_id: sketchIdx,
			start_point_id: parseInt(point1),
			end_point_id: parseInt(point2)
		}
	}
	sendWasmMessage(messageObj)

	workbenchIsStale.set(true)
}

export function addPointToSketch(sketchIdx: string, point: Vector2Like, hidden: boolean) {
	// log("[addPointToSketch] sketchIdx, point, hidden", sketchIdx, point, hidden)
	const messageObj: Message = {
		NewPointOnSketch2: {
			workbench_id: get(workbenchIndex),
			sketch_id: sketchIdx,
			x: point.x,
			y: point.y,
			hidden: hidden
		}
	}
	let result = sendWasmMessage(messageObj)
	workbenchIsStale.set(true)
	return result.success.id
}

export function renameStep(stepIdx: number, newName: string) {
	log("[renameStep] stepIdx, newName", stepIdx, newName)
	const messageObj: Message = {
		RenameStep: {
			workbench_id: get(workbenchIndex),
			step_id: stepIdx,
			new_name: newName
		}
	}
	sendWasmMessage(messageObj)
}

// If the project ever becomes stale, refresh it. This should be pretty rare.
projectIsStale.subscribe((value) => {
	if (value) {

		let wp = get(wasmProject)
		project.set(JSON.parse(wp.to_json()))

		workbenchIndex.set(0)
		workbenchIsStale.set(true)

		projectIsStale.set(false)
		// @ts-ignore
		log("Refreshing project", value, wp, project)
	}
})

// If the workbench ever becomes stale, refresh it. This should be very common.
// Every time you edit any part of the feature history, for example
workbenchIsStale.subscribe((value) => {
	if (value) {
		let workbenchIdx = get(workbenchIndex)
		let wasmProj = get(wasmProject)
		let workbenchJson = wasmProj.get_workbench(workbenchIdx)
		// TODO: reach inside of project and set its representation
		// of the workbench to the new one that we just got
		workbench.set(JSON.parse(workbenchJson))
		workbenchIsStale.set(false)

		// log("Workbench:", get(workbench))

		realizationIsStale.set(true)
	}
})

// If the realization ever becomes stale, refresh it. This should be very common.
// Every time you edit any part of the feature history, for example
realizationIsStale.subscribe((value) => {
	if (value) {
		log("Refreshing realization")

		let wasmProj = get(wasmProject)
		let workbenchIdx = get(workbenchIndex)
		let wasmReal: WasmRealization = wasmProj.get_realization(workbenchIdx, get(featureIndex) + 1)
		wasmRealization.set(wasmReal)
		realization.set(JSON.parse(wasmReal.to_json()))
		log("New realization:", get(realization))
		// log("[wasmProj]", wasmProj)

		realizationIsStale.set(false)
	}
})

export function getObj(solidId: string) {
	// log("[getObj] solidId:", solidId)
	const wasmReal = get(wasmRealization)
	const objString = wasmReal.solid_to_obj(solidId, 0.1)
	return objString
}

export function readFile(e: WithTarget<Event, HTMLInputElement>) {
	const target = e.target as HTMLInputElement
	const file = target.files![0]
	const reader = new FileReader()
	reader.onload = function (e) {
		log("file contents", e.target?.result)
	}
	reader.readAsText(file)
}

export function arcToPoints(center: Vector2, start: Vector2, end: Vector2, clockwise: boolean = false) {
	log("[arcToPoints] center, start, end, clockwise", center, start, end, clockwise)
	// see https://math.stackexchange.com/a/4132095/816177
	const tolerance = CIRCLE_TOLERANCE // in meters
	const radius = start.distanceTo(center)
	const k = tolerance / radius
	// more precise but slower to calculate:
	// const n = Math.ceil(Math.PI / Math.acos(1 - k))
	// faster to calculate, at most only overestimates by 1:
	let n = Math.ceil(Math.PI / Math.sqrt(2 * k))
	const segmentAngle = (2 * Math.PI) / n
	const segmentLength = radius * segmentAngle
	if (clockwise) {
		n = -n
	}

	const startAngle = Math.atan2(start.y - center.y, start.x - center.x)

	const lineVertices = []
	lineVertices.push(start.clone())
	for (let i = 1; i <= Math.abs(n); i++) {
		let theta = ((2 * Math.PI) / n) * i + startAngle
		let xComponent = radius * Math.cos(theta)
		let yComponent = radius * Math.sin(theta)
		let point = new Vector2(xComponent, yComponent).add(center)
		lineVertices.push(point)

		let distanceToEnd = point.distanceTo(end)
		if (distanceToEnd <= segmentLength) {
			lineVertices.push(end.clone())
			break
		}
	}
	return lineVertices
}

export function circleToPoints(centerPoint: Vector2, radius: number) {
	// this is 2D function
	// centerPoint is a Vector2, radius is a float
	// returns an array of Vector2's

	// see https://math.stackexchange.com/a/4132095/816177
	const tolerance = CIRCLE_TOLERANCE // in meters
	const k = tolerance / radius
	// more precise but slower to calculate:
	// const n = Math.ceil(Math.PI / Math.acos(1 - k))
	// faster to calculate, at most only overestimates by 1:
	const n = Math.ceil(Math.PI / Math.sqrt(2 * k))

	const lineVertices = []
	for (let i = 0; i <= n; i++) {
		let theta = ((2 * Math.PI) / n) * i
		let xComponent = radius * Math.cos(theta)
		let yComponent = radius * Math.sin(theta)
		let point = new Vector2(xComponent, yComponent).add(centerPoint)
		lineVertices.push(point)
	}
	return lineVertices
}

export function promoteTo3(points: Vector2[]) {
	// points is an array of Vector2's
	// returns an array of Vector3's
	let points3 = []
	for (let point of points) {
		points3.push(new Vector3(point.x, point.y, 0))
	}
	return points3 as Vector3[]
}

export function flatten(points: Vector3[]) {
	// points is an array of Vector3's
	// returns a flattened array of floats
	let pointsFlat = []

	for (let point of points) {
		pointsFlat.push(point.x, point.y, point.z)
	}
	return pointsFlat
}
