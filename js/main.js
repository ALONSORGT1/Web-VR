// Web-VR: version adaptada del ejemplo de three.js "webxr_vr_handinput_pointerdrag"
// https://github.com/mrdoob/three.js/blob/master/examples/webxr_vr_handinput_pointerdrag.html
// (MIT, three.js authors). Cambios: textos en espanol, hand-tracking opcional,
// controles fisicos con gatillo, fisica de cuerpos rigidos (cannon-es) y menu movible.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { OculusHandModel } from 'three/addons/webxr/OculusHandModel.js';
import { OculusHandPointerModel } from 'three/addons/webxr/OculusHandPointerModel.js';
import { createText } from 'three/addons/webxr/Text2D.js';

const CUBE_COUNT = 20;
const ROOM_HALF = 4;             // sala de 8 x 8 m
const MAX_HOLD_SPEED = 8;        // m/s: velocidad maxima con la que el cubo sigue a la mano
const MAX_HOLD_DISTANCE = 0.8;   // si el cubo queda mas lejos de la mano (bloqueado), se suelta
const PHYSICS_SUBSTEPS = 2;

let camera, scene, renderer, world;
let menuMesh, menuItem, instructionText, exitText;
let controllers, handPointers;
let needsCalibration = true;
let lastTime = performance.now();

// mallas que los rayos pueden intersectar
const intersectables = [];
const buttons = [];   // { mesh, action, pressedUntil }
const cubes = [];     // items de tipo cubo: { kind, mesh, body, size, held, offset }

// estado de cada mano (pellizco) y de cada control fisico (gatillo)
const handStates = [ { held: null, holder: null, prevPinched: false }, { held: null, holder: null, prevPinched: false } ];
const controllerStates = [ { held: null, holder: null }, { held: null, holder: null } ];
const rayControllers = [];

const raycaster = new THREE.Raycaster();
const tempMatrix = new THREE.Matrix4();
const headPos = new THREE.Vector3();
const headDir = new THREE.Vector3();

/* ---------- Menu: panel y botones con textura ---------- */

function roundedRect( ctx, x, y, w, h, r ) {

	ctx.beginPath();
	ctx.moveTo( x + r, y );
	ctx.arcTo( x + w, y, x + w, y + h, r );
	ctx.arcTo( x + w, y + h, x, y + h, r );
	ctx.arcTo( x, y + h, x, y, r );
	ctx.arcTo( x, y, x + w, y, r );
	ctx.closePath();

}

function toTexture( canvas ) {

	const texture = new THREE.CanvasTexture( canvas );
	texture.colorSpace = THREE.SRGBColorSpace;
	texture.anisotropy = 8;
	return texture;

}

function makePanelTexture( title, hint, w, h ) {

	const canvas = document.createElement( 'canvas' );
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext( '2d' );
	roundedRect( ctx, 4, 4, w - 8, h - 8, 44 );
	ctx.fillStyle = 'rgba(20, 24, 33, 0.94)';
	ctx.fill();
	ctx.lineWidth = 4;
	ctx.strokeStyle = '#3b4456';
	ctx.stroke();
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillStyle = '#e9edf4';
	ctx.font = '600 52px system-ui, "Segoe UI", sans-serif';
	ctx.fillText( title, w / 2, h * 0.12 );
	ctx.fillStyle = '#8b95a8';
	ctx.font = '400 30px system-ui, "Segoe UI", sans-serif';
	ctx.fillText( hint, w / 2, h * 0.92 );
	return toTexture( canvas );

}

function drawButton( label, color, active, w, h ) {

	const canvas = document.createElement( 'canvas' );
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext( '2d' );
	roundedRect( ctx, 6, 6, w - 12, h - 12, h * 0.3 );
	ctx.fillStyle = color;
	ctx.fill();
	if ( active ) {

		ctx.fillStyle = 'rgba(255, 255, 255, 0.18)';
		ctx.fill();

	}

	ctx.lineWidth = active ? 10 : 4;
	ctx.strokeStyle = active ? '#ffffff' : 'rgba(255, 255, 255, 0.35)';
	ctx.stroke();
	ctx.fillStyle = '#ffffff';
	ctx.font = '700 ' + Math.round( h * 0.42 ) + 'px system-ui, "Segoe UI", sans-serif';
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';
	ctx.fillText( label, w / 2, h / 2 + 3 );
	return toTexture( canvas );

}

function makeButton( label, color, width, height, action ) {

	const w = 768;
	const h = Math.round( w * height / width );
	const textures = {
		none: drawButton( label, color, false, w, h ),
		active: drawButton( label, color, true, w, h )
	};
	const mesh = new THREE.Mesh(
		new THREE.PlaneGeometry( width, height ),
		new THREE.MeshBasicMaterial( { map: textures.none, transparent: true } )
	);
	const button = { mesh, textures, action, pressedUntil: 0, hovered: false };
	mesh.userData.button = button;
	buttons.push( button );
	intersectables.push( mesh );
	return mesh;

}

/* ---------- Escena ---------- */

function init() {

	const container = document.createElement( 'div' );
	document.body.appendChild( container );

	scene = new THREE.Scene();
	scene.background = new THREE.Color( 0x444444 );

	camera = new THREE.PerspectiveCamera( 50, window.innerWidth / window.innerHeight, 0.1, 20 );
	camera.position.set( 0, 1.2, 0.3 );

	scene.add( new THREE.HemisphereLight( 0xcccccc, 0x999999, 3 ) );

	const light = new THREE.DirectionalLight( 0xffffff, 3 );
	light.position.set( 0, 6, 0 );
	light.castShadow = true;
	light.shadow.camera.top = 3;
	light.shadow.camera.bottom = - 3;
	light.shadow.camera.right = 3;
	light.shadow.camera.left = - 3;
	light.shadow.mapSize.set( 2048, 2048 );
	scene.add( light );

	renderer = new THREE.WebGLRenderer( { antialias: true } );
	renderer.setPixelRatio( window.devicePixelRatio );
	renderer.setSize( window.innerWidth, window.innerHeight );
	renderer.setAnimationLoop( animate );
	renderer.shadowMap.enabled = true;
	renderer.xr.enabled = true;
	renderer.xr.cameraAutoUpdate = false;
	// al terminar la sesion, el menu se vuelve a colocar en la siguiente
	renderer.xr.addEventListener( 'sessionend', () => {

		needsCalibration = true;
		handStates.concat( controllerStates ).forEach( endGrab );

	} );
	container.appendChild( renderer.domElement );

	// hand-tracking opcional: se puede entrar a VR con manos o con controles
	const sessionInit = {
		optionalFeatures: [ 'hand-tracking' ]
	};

	document.body.appendChild( VRButton.createButton( renderer, sessionInit ) );

	createPhysicsWorld();

	// controllers
	const controller1 = renderer.xr.getController( 0 );
	scene.add( controller1 );

	const controller2 = renderer.xr.getController( 1 );
	scene.add( controller2 );

	[ controller1, controller2 ].forEach( setupRayController );

	const controllerModelFactory = new XRControllerModelFactory();

	// Mano 1
	const controllerGrip1 = renderer.xr.getControllerGrip( 0 );
	controllerGrip1.add( controllerModelFactory.createControllerModel( controllerGrip1 ) );
	scene.add( controllerGrip1 );

	const hand1 = renderer.xr.getHand( 0 );
	hand1.add( new OculusHandModel( hand1 ) );
	const handPointer1 = new OculusHandPointerModel( hand1, controller1 );
	hand1.add( handPointer1 );
	scene.add( hand1 );

	// Mano 2
	const controllerGrip2 = renderer.xr.getControllerGrip( 1 );
	controllerGrip2.add( controllerModelFactory.createControllerModel( controllerGrip2 ) );
	scene.add( controllerGrip2 );

	const hand2 = renderer.xr.getHand( 1 );
	hand2.add( new OculusHandModel( hand2 ) );
	const handPointer2 = new OculusHandPointerModel( hand2, controller2 );
	hand2.add( handPointer2 );
	scene.add( hand2 );

	controllers = [ controllerGrip1, controllerGrip2 ];
	handPointers = [ handPointer1, handPointer2 ];

	// suelo
	const floor = new THREE.Mesh(
		new THREE.PlaneGeometry( ROOM_HALF * 2, ROOM_HALF * 2 ),
		new THREE.MeshPhongMaterial( { color: 0x222222 } )
	);
	floor.rotation.x = - Math.PI / 2;
	floor.receiveShadow = true;
	scene.add( floor );

	// menu: panel con dos botones (reiniciar / salir). Tambien se puede agarrar y mover.
	menuMesh = new THREE.Mesh(
		new THREE.PlaneGeometry( 0.46, 0.5 ),
		new THREE.MeshBasicMaterial( {
			map: makePanelTexture( 'Menú', 'Agarra el panel para moverlo', 768, 835 ),
			transparent: true
		} )
	);
	menuMesh.position.set( 0.4, 1, - 1 );
	menuMesh.rotation.y = - Math.PI / 12;
	scene.add( menuMesh );
	menuItem = { kind: 'menu', mesh: menuMesh, held: null, offset: new THREE.Matrix4() };
	menuMesh.userData.item = menuItem;
	intersectables.push( menuMesh );

	const resetButton = makeButton( 'Reiniciar', '#1f8a7a', 0.38, 0.12, resetCubes );
	resetButton.position.set( 0, 0.05, 0.004 );
	menuMesh.add( resetButton );

	const exitButton = makeButton( 'Salir de VR', '#c0392b', 0.38, 0.12, exitSession );
	exitButton.position.set( 0, - 0.1, 0.004 );
	menuMesh.add( exitButton );

	instructionText = createText( 'Agarra, apila y lanza los cubos pellizcando con las manos o con el gatillo.', 0.03 );
	instructionText.position.set( 0, 1.6, - 0.6 );
	scene.add( instructionText );

	exitText = createText( 'Saliendo de la sesion...', 0.04 );
	exitText.position.set( 0, 0.33, 0.01 );
	exitText.visible = false;
	menuMesh.add( exitText );

	// cubos
	const boxGeometry = new THREE.BoxGeometry( 1, 1, 1 );
	for ( let i = 0; i < CUBE_COUNT; i ++ ) {

		cubes.push( createCube( boxGeometry ) );

	}

	resetCubes();

	window.addEventListener( 'resize', onWindowResize );

	// ganchos para depuracion y pruebas automaticas
	window.__vr = { cubes, menuItem, world, resetCubes, startGrab, endGrab, handStates, getHeadPose, animate, updateHeld, stepPhysics };

}

function exitSession() {

	exitText.visible = true;
	setTimeout( function () {

		exitText.visible = false;
		const session = renderer.xr.getSession();
		if ( session ) session.end();

	}, 2000 );

}

/* ---------- Fisica ---------- */

function createPhysicsWorld() {

	world = new CANNON.World( { gravity: new CANNON.Vec3( 0, - 9.82, 0 ) } );
	world.solver.iterations = 40;     // pilas estables

	const floorMaterial = new CANNON.Material( 'suelo' );
	const cubeMaterial = new CANNON.Material( 'cubo' );
	world.cubeMaterial = cubeMaterial;
	world.addContactMaterial( new CANNON.ContactMaterial( cubeMaterial, cubeMaterial, { friction: 0.5, restitution: 0.12 } ) );
	world.addContactMaterial( new CANNON.ContactMaterial( floorMaterial, cubeMaterial, { friction: 0.6, restitution: 0.1 } ) );

	// suelo infinito
	const floorBody = new CANNON.Body( { mass: 0, shape: new CANNON.Plane(), material: floorMaterial } );
	floorBody.quaternion.setFromEuler( - Math.PI / 2, 0, 0 );
	world.addBody( floorBody );

	// paredes invisibles para que nada se salga de la sala
	const t = 0.5;
	[
		[ ROOM_HALF + t, 0, t, ROOM_HALF + 1 ],
		[ - ROOM_HALF - t, 0, t, ROOM_HALF + 1 ],
		[ 0, ROOM_HALF + t, ROOM_HALF + 1, t ],
		[ 0, - ROOM_HALF - t, ROOM_HALF + 1, t ]
	].forEach( ( [ x, z, hx, hz ] ) => {

		const wall = new CANNON.Body( { mass: 0, shape: new CANNON.Box( new CANNON.Vec3( hx, 6, hz ) ), material: floorMaterial } );
		wall.position.set( x, 6, z );
		world.addBody( wall );

	} );

}

function createCube( geometry ) {

	const size = 0.12 + Math.random() * 0.06;      // arista entre 12 y 18 cm
	const mesh = new THREE.Mesh( geometry, new THREE.MeshLambertMaterial( { color: 0xffffff } ) );
	mesh.scale.setScalar( size );
	mesh.castShadow = true;
	mesh.receiveShadow = true;
	scene.add( mesh );

	const body = new CANNON.Body( {
		mass: 400 * size * size * size,                // densidad ~400 kg/m3 (0.7 a 2.3 kg)
		shape: new CANNON.Box( new CANNON.Vec3( size / 2, size / 2, size / 2 ) ),
		material: world.cubeMaterial,
		linearDamping: 0.05,
		angularDamping: 0.2,
		allowSleep: false
	} );
	world.addBody( body );

	const item = { kind: 'cube', mesh, body, size, held: null, offset: new THREE.Matrix4() };
	mesh.userData.item = item;
	intersectables.push( mesh );
	return item;

}

function stepPhysics( dt ) {

	const h = dt / PHYSICS_SUBSTEPS;
	for ( let i = 0; i < PHYSICS_SUBSTEPS; i ++ ) world.step( h );

	cubes.forEach( item => {

		const body = item.body;
		if ( body.position.y < - 2 ) placeCube( item, [] );    // red de seguridad
		item.mesh.position.copy( body.position );
		item.mesh.quaternion.copy( body.quaternion );

		// el cubo nunca se hunde en el suelo, ni un instante, aunque la mano lo empuje fuerte
		item.mesh.updateMatrix();
		const e = item.mesh.matrix.elements;
				const halfHeight = ( Math.abs( e[ 1 ] ) + Math.abs( e[ 5 ] ) + Math.abs( e[ 9 ] ) ) / 2;
		if ( body.position.y < halfHeight - 1e-4 ) {

			body.position.y = halfHeight;
			if ( body.velocity.y < 0 ) body.velocity.y = 0;
			item.mesh.position.y = halfHeight;

		}


	} );

}

/* ---------- Posicion inicial de los cubos (sin tapar la vista) ---------- */

function getHeadPose() {

	const cam = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera;
	cam.getWorldPosition( headPos );
	cam.getWorldDirection( headDir );

}

function placeCube( item, placed ) {

	getHeadPose();
	let fx = headDir.x;
	let fz = headDir.z;
	const len = Math.hypot( fx, fz ) || 1;
	fx /= len;
	fz /= len;
	const rx = - fz;      // vector "derecha" en el plano del suelo
	const rz = fx;
	const coneLimit = THREE.MathUtils.degToRad( 55 );

	let x = 0, y = 0.5, z = 0, found = false;
	for ( let tries = 0; tries < 80 && ! found; tries ++ ) {

		const r = 0.8 + Math.random() * 1.7;                 // entre 0.8 y 2.5 m de la cabeza
		const phi = ( Math.random() * 2 - 1 ) * Math.PI;     // 0 = justo al frente
		if ( Math.abs( phi ) < coneLimit && r < 1.9 ) continue;   // el frente cercano queda libre

		x = headPos.x + r * ( Math.cos( phi ) * fx + Math.sin( phi ) * rx );
		z = headPos.z + r * ( Math.cos( phi ) * fz + Math.sin( phi ) * rz );
		y = 0.3 + Math.random() * 0.9;
		if ( Math.abs( x ) > ROOM_HALF - 0.4 || Math.abs( z ) > ROOM_HALF - 0.4 ) continue;
		if ( placed.every( p => Math.hypot( p.x - x, p.y - y, p.z - z ) > 0.35 ) ) found = true;

	}

	if ( ! found ) {

		// ultimo recurso: detras del usuario
		x = headPos.x - fx * 1.5;
		z = headPos.z - fz * 1.5;
		x = THREE.MathUtils.clamp( x, - ROOM_HALF + 0.4, ROOM_HALF - 0.4 );
		z = THREE.MathUtils.clamp( z, - ROOM_HALF + 0.4, ROOM_HALF - 0.4 );

	}

	placed.push( { x, y, z } );

	const body = item.body;
	body.position.set( x, y, z );
	body.quaternion.setFromEuler( Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28 );
	body.velocity.set( 0, 0, 0 );
	body.angularVelocity.set( 0, 0, 0 );
	body.aabbNeedsUpdate = true;
	item.mesh.position.copy( body.position );
	item.mesh.quaternion.copy( body.quaternion );

}

function resetCubes() {

	const placed = [];
	cubes.forEach( item => {

		if ( item.held ) endGrab( item.held );
		item.mesh.material.color.setHex( Math.random() * 0xffffff );
		placeCube( item, placed );

	} );

}

/* ---------- Agarre: el cubo sigue a la mano pero las colisiones lo frenan ---------- */

function startGrab( state, item, holder ) {

	if ( state.held ) endGrab( state );
	if ( item.held ) endGrab( item.held );    // si otra mano lo tenia, se lo quitamos

	holder.updateWorldMatrix( true, false );
	// offset = inversa(holder) * mundo(item): posicion del objeto dentro del sistema de la mano
	if ( item.body ) {

		_m.compose( _p.copy( item.body.position ), _q.copy( item.body.quaternion ), _s.set( 1, 1, 1 ) );

	} else {

		item.mesh.updateWorldMatrix( true, false );
		_m.copy( item.mesh.matrixWorld );

	}

	item.offset.copy( holder.matrixWorld ).invert().multiply( _m );

	item.held = state;
	state.held = item;
	state.holder = holder;
	if ( item.body ) item.body.wakeUp();

}

function endGrab( state ) {

	const item = state.held;
	if ( ! item ) return;
	item.held = null;
	state.held = null;
	state.holder = null;
	if ( state.pointer ) state.pointer.setAttached( false );
	// el cubo conserva la velocidad que llevaba: asi se puede lanzar

}

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();

function updateHeld( dt ) {

	[ menuItem, ...cubes ].forEach( item => {

		const state = item.held;
		if ( ! state ) return;

		state.holder.updateWorldMatrix( true, false );
		_m.multiplyMatrices( state.holder.matrixWorld, item.offset );
		_m.decompose( _p, _q, _s );

		if ( item.kind === 'menu' ) {

			// el menu sigue a la mano y siempre queda de frente al usuario
			item.mesh.position.set( _p.x, Math.max( 0.35, _p.y ), _p.z );
			getHeadPose();
			item.mesh.lookAt( headPos.x, item.mesh.position.y, headPos.z );
			return;

		}

		const body = item.body;
		const dx = _p.x - body.position.x;
		const dy = _p.y - body.position.y;
		const dz = _p.z - body.position.z;
		const dist = Math.hypot( dx, dy, dz );

		if ( dist > MAX_HOLD_DISTANCE ) {

			endGrab( state );    // quedo bloqueado lejos de la mano: se suelta
			return;

		}

		// velocidad hacia la mano (limitada): choca con el suelo y con otros cubos
		// y, al soltarlo, conserva el impulso de la mano
		const speed = dist / dt;
		const k = speed > MAX_HOLD_SPEED ? MAX_HOLD_SPEED / speed : 1;
		body.velocity.set( dx / dt * k, dy / dt * k, dz / dt * k );
		body.quaternion.set( _q.x, _q.y, _q.z, _q.w );
		body.angularVelocity.set( 0, 0, 0 );
		body.aabbNeedsUpdate = true;
		body.wakeUp();

	} );

}

/* ---------- Controles fisicos (gatillo) ---------- */

function setupRayController( controller ) {

	const state = controllerStates[ rayControllers.length ];
	controller.userData.state = state;

	const ray = new THREE.Line(
		new THREE.BufferGeometry().setFromPoints( [ new THREE.Vector3( 0, 0, 0 ), new THREE.Vector3( 0, 0, - 1 ) ] ),
		new THREE.LineBasicMaterial( { color: 0xffffff } )
	);
	ray.name = 'ray';
	ray.scale.z = 2;
	ray.visible = false;
	controller.add( ray );

	controller.addEventListener( 'connected', ( event ) => {

		// con hand-tracking el rayo lo dibuja OculusHandPointerModel
		controller.userData.isHand = !! event.data.hand;
		ray.visible = ! controller.userData.isHand;

	} );
	controller.addEventListener( 'disconnected', () => {

		ray.visible = false;
		endGrab( state );

	} );
	controller.addEventListener( 'selectstart', onControllerSelectStart );
	controller.addEventListener( 'selectend', ( event ) => endGrab( event.target.userData.state ) );
	rayControllers.push( controller );

}

function castFromController( controller ) {

	tempMatrix.identity().extractRotation( controller.matrixWorld );
	raycaster.ray.origin.setFromMatrixPosition( controller.matrixWorld );
	raycaster.ray.direction.set( 0, 0, - 1 ).applyMatrix4( tempMatrix );
	const hits = raycaster.intersectObjects( intersectables, false );
	return hits.length ? hits[ 0 ] : null;

}

function onControllerSelectStart( event ) {

	const controller = event.target;
	if ( controller.userData.isHand || ! event.data || event.data.hand ) return;
	const hit = castFromController( controller );
	if ( hit ) pressObject( hit.object, controller.userData.state, controller );

}

/* ---------- Interaccion comun (manos y controles) ---------- */

function pressObject( object, state, holder ) {

	const button = object.userData.button;
	if ( button ) {

		button.pressedUntil = performance.now() + 180;
		button.action();
		return;

	}

	const item = object.userData.item;
	if ( item ) startGrab( state, item, holder );

}

function updateHands( hovered ) {

	handPointers.forEach( ( hp, i ) => {

		const state = handStates[ i ];
		state.pointer = hp;
		const pinched = hp.isPinched();

		if ( state.held ) {

			if ( ! pinched ) endGrab( state );

		} else {

			const hits = hp.intersectObjects( intersectables, false );
			const hit = hits && hits.length > 0 ? hits[ 0 ] : null;
			if ( hit ) {

				hp.setCursor( hit.distance );
				hovered.add( hit.object );
				// se agarra al empezar el pellizco, no al barrer con el rayo
				if ( pinched && ! state.prevPinched ) {

					pressObject( hit.object, state, hp.children[ 0 ] );
					if ( state.held ) hp.setAttached( true );

				}

			} else {

				hp.setCursor( 1.5 );

			}

		}

		state.prevPinched = pinched;

	} );

}

function updateControllerRays( hovered ) {

	rayControllers.forEach( controller => {

		const ray = controller.getObjectByName( 'ray' );
		const state = controller.userData.state;
		if ( state.held ) {

			ray.scale.z = 0.2;
			return;

		}

		const hit = controller.userData.isHand ? null : castFromController( controller );
		if ( hit ) {

			hovered.add( hit.object );
			ray.scale.z = hit.distance;

		} else {

			ray.scale.z = 2;

		}

	} );

}

function updateHover( hovered ) {

	cubes.forEach( item => {

		item.mesh.scale.setScalar( item.held ? item.size : hovered.has( item.mesh ) ? item.size * 1.1 : item.size );

	} );

	const now = performance.now();
	buttons.forEach( button => {

		const pressed = now < button.pressedUntil;
		const hover = hovered.has( button.mesh );
		const map = pressed || hover ? button.textures.active : button.textures.none;
		if ( button.mesh.material.map !== map ) button.mesh.material.map = map;
		const scale = pressed ? 0.96 : hover ? 1.05 : 1;
		button.mesh.scale.set( scale, scale, 1 );

	} );

}

/* ---------- Bucle ---------- */

function onWindowResize() {

	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize( window.innerWidth, window.innerHeight );

}

function calibrateMenu() {

	// al iniciar la sesion: coloca el menu bajo la vista y reparte los cubos alrededor
	if ( needsCalibration && renderer.xr.getSession() ) {

		const xrCamera = renderer.xr.getCamera();
		menuMesh.position.set( xrCamera.position.x + 0.35, xrCamera.position.y - 0.2, xrCamera.position.z - 0.9 );
		menuMesh.lookAt( xrCamera.position.x, menuMesh.position.y, xrCamera.position.z );
		resetCubes();
		needsCalibration = false;

	}

}

function updateInstructionText() {

	// el texto solo se ve mientras se usan controles fisicos
	instructionText.visible = controllers.some( controller => controller.visible );

}

function animate() {

	const now = performance.now();
	const dt = Math.min( Math.max( ( now - lastTime ) / 1000, 1 / 144 ), 1 / 30 );
	lastTime = now;

	renderer.xr.updateCamera( camera );
	calibrateMenu();
	updateInstructionText();

	const hovered = new Set();
	updateHands( hovered );
	updateControllerRays( hovered );
	updateHeld( dt );
	stepPhysics( dt );
	updateHover( hovered );

	renderer.render( scene, camera );

}

init();
