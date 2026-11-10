// Web-VR: version adaptada del ejemplo de three.js "webxr_vr_handinput_pointerdrag"
// https://github.com/mrdoob/three.js/blob/master/examples/webxr_vr_handinput_pointerdrag.html
// (MIT, three.js authors). Cambios: textos en espanol, hand-tracking opcional
// y soporte de controles fisicos con el gatillo ademas del pellizco.
import * as THREE from 'three';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { OculusHandModel } from 'three/addons/webxr/OculusHandModel.js';
import { OculusHandPointerModel } from 'three/addons/webxr/OculusHandPointerModel.js';
import { createText } from 'three/addons/webxr/Text2D.js';

let camera, scene, renderer;
let menuMesh, instructionText;
let controllers, handPointers;
let needsCalibration = true;

// mallas que los rayos pueden intersectar
const intersectables = [];

// estados de boton: [none, hovered, pressed]
const buttons = [];

// estados de arrastre: [detached, hovered, to-be-attached, attached, to-be-detached]
const draggables = [];

// controles fisicos (rayo + gatillo)
const rayControllers = [];
const raycaster = new THREE.Raycaster();
const tempMatrix = new THREE.Matrix4();

init();

function makeButtonMesh( x, y, z, color ) {

	const geometry = new THREE.BoxGeometry( x, y, z );
	const material = new THREE.MeshPhongMaterial( { color: color } );
	return new THREE.Mesh( geometry, material );

}

function init() {

	const container = document.createElement( 'div' );
	document.body.appendChild( container );

	scene = new THREE.Scene();
	scene.background = new THREE.Color( 0x444444 );

	camera = new THREE.PerspectiveCamera( 50, window.innerWidth / window.innerHeight, 0.1, 10 );
	camera.position.set( 0, 1.2, 0.3 );

	scene.add( new THREE.HemisphereLight( 0xcccccc, 0x999999, 3 ) );

	const light = new THREE.DirectionalLight( 0xffffff, 3 );
	light.position.set( 0, 6, 0 );
	light.castShadow = true;
	light.shadow.camera.top = 2;
	light.shadow.camera.bottom = - 2;
	light.shadow.camera.right = 2;
	light.shadow.camera.left = - 2;
	light.shadow.mapSize.set( 4096, 4096 );
	scene.add( light );

	renderer = new THREE.WebGLRenderer( { antialias: true } );
	renderer.setPixelRatio( window.devicePixelRatio );
	renderer.setSize( window.innerWidth, window.innerHeight );
	renderer.setAnimationLoop( animate );
	renderer.shadowMap.enabled = true;
	renderer.xr.enabled = true;
	renderer.xr.cameraAutoUpdate = false;
	container.appendChild( renderer.domElement );

	// hand-tracking opcional: se puede entrar a VR con manos o con controles
	const sessionInit = {
		optionalFeatures: [ 'hand-tracking' ]
	};

	document.body.appendChild( VRButton.createButton( renderer, sessionInit ) );

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

	// objetos de la escena
	const floorGeometry = new THREE.PlaneGeometry( 4, 4 );
	const floorMaterial = new THREE.MeshPhongMaterial( { color: 0x222222 } );
	const floor = new THREE.Mesh( floorGeometry, floorMaterial );
	floor.rotation.x = - Math.PI / 2;
	floor.receiveShadow = true;
	scene.add( floor );

	// menu
	const menuGeometry = new THREE.PlaneGeometry( 0.24, 0.5 );
	const menuMaterial = new THREE.MeshPhongMaterial( {
		opacity: 0,
		transparent: true,
	} );
	menuMesh = new THREE.Mesh( menuGeometry, menuMaterial );
	menuMesh.position.set( 0.4, 1, - 1 );
	menuMesh.rotation.y = - Math.PI / 12;
	scene.add( menuMesh );

	const resetButton = makeButtonMesh( 0.2, 0.1, 0.01, 0x355c7d );
	const resetButtonText = createText( 'reiniciar', 0.05 );
	resetButton.add( resetButtonText );
	resetButtonText.position.set( 0, 0, 0.0051 );
	resetButton.position.set( 0, - 0.06, 0 );
	menuMesh.add( resetButton );

	const exitButton = makeButtonMesh( 0.2, 0.1, 0.01, 0xff0000 );
	const exitButtonText = createText( 'salir', 0.06 );
	exitButton.add( exitButtonText );
	exitButtonText.position.set( 0, 0, 0.0051 );
	exitButton.position.set( 0, - 0.18, 0 );
	menuMesh.add( exitButton );

	instructionText = createText( 'Demo WebXR: arrastra los cubos pellizcando con las manos o con el gatillo.', 0.03 );
	instructionText.position.set( 0, 1.6, - 0.6 );
	scene.add( instructionText );

	const exitText = createText( 'Saliendo de la sesion...', 0.04 );
	exitText.position.set( 0, 1.5, - 0.6 );
	exitText.visible = false;
	scene.add( exitText );

	for ( let i = 0; i < 20; i ++ ) {

		const object = new THREE.Mesh( new THREE.BoxGeometry( 0.15, 0.15, 0.15 ), new THREE.MeshLambertMaterial( { color: 0xffffff } ) );
		scene.add( object );

		intersectables.push( object );
		draggables.push( { mesh: object, state: 'detached', originalParent: scene, attachedPointer: null } );

	}

	randomizeObjects();

	intersectables.push( menuMesh, resetButton, exitButton );

	buttons.push(
		{ mesh: resetButton, currState: 'none', prevState: 'none', action: function () {

			randomizeObjects();

		} },
		{ mesh: exitButton, currState: 'none', prevState: 'none', action: function () {

			exitText.visible = true;
			setTimeout( function () {

				exitText.visible = false;
				const session = renderer.xr.getSession();
				if ( session ) session.end();

			}, 2000 );

		} }
	);

	window.addEventListener( 'resize', onWindowResize );

}

/* ---------- Controles fisicos (gatillo) ---------- */

function setupRayController( controller ) {

	const ray = new THREE.Line(
		new THREE.BufferGeometry().setFromPoints( [ new THREE.Vector3( 0, 0, 0 ), new THREE.Vector3( 0, 0, - 1 ) ] ),
		new THREE.LineBasicMaterial( { color: 0xffffff } )
	);
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

	} );
	controller.addEventListener( 'selectstart', onControllerSelectStart );
	controller.addEventListener( 'selectend', onControllerSelectEnd );
	rayControllers.push( controller );

}

function onControllerSelectStart( event ) {

	const controller = event.target;
	if ( controller.userData.isHand || ! event.data || event.data.hand ) return;

	tempMatrix.identity().extractRotation( controller.matrixWorld );
	raycaster.ray.origin.setFromMatrixPosition( controller.matrixWorld );
	raycaster.ray.direction.set( 0, 0, - 1 ).applyMatrix4( tempMatrix );

	const hits = raycaster.intersectObjects( intersectables, false );
	if ( hits.length === 0 ) return;

	const object = hits[ 0 ].object;
	const draggable = draggables.find( d => d.mesh === object );
	if ( draggable !== undefined && draggable.state === 'detached' ) {

		controller.attach( object );
		draggable.state = 'controller';
		controller.userData.selected = draggable;
		return;

	}

	const button = buttons.find( b => b.mesh === object );
	if ( button !== undefined ) button.action();

}

function onControllerSelectEnd( event ) {

	const controller = event.target;
	const draggable = controller.userData.selected;
	if ( draggable ) {

		draggable.originalParent.attach( draggable.mesh );
		draggable.state = 'detached';
		controller.userData.selected = undefined;

	}

}

/* ---------- Ejemplo original ---------- */

function onWindowResize() {

	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize( window.innerWidth, window.innerHeight );

}

function randomizeObjects() {

	draggables.forEach( draggable => {

		// suelta primero lo que este sostenido con un control
		if ( draggable.state === 'controller' ) {

			rayControllers.forEach( c => {

				if ( c.userData.selected === draggable ) c.userData.selected = undefined;

			} );
			draggable.originalParent.attach( draggable.mesh );
			draggable.state = 'detached';

		}

		const object = draggable.mesh;
		object.material.color.setHex( Math.random() * 0xffffff );
		object.position.x = Math.random() * 2 - 1;
		object.position.y = Math.random() * 2;
		object.position.z = Math.random() * 2 - 1;
		object.rotation.x = Math.random() * 2 * Math.PI;
		object.rotation.y = Math.random() * 2 * Math.PI;
		object.rotation.z = Math.random() * 2 * Math.PI;
		object.scale.x = Math.random() + 0.5;
		object.scale.y = Math.random() + 0.5;
		object.scale.z = Math.random() + 0.5;

	} );

}

function calibrateMenu() {

	// coloca el menu relativo a la camara una vez iniciada la sesion
	if ( needsCalibration && renderer.xr.getSession() ) {

		const xrCamera = renderer.xr.getCamera();
		menuMesh.position.x = xrCamera.position.x + 0.4;
		menuMesh.position.y = xrCamera.position.y;
		menuMesh.position.z = xrCamera.position.z - 1;
		needsCalibration = false;

	}

}

function updateInstructionText() {

	// el texto solo se ve mientras se usan controles fisicos
	instructionText.visible = controllers.some( controller => controller.visible );

}

function updateDraggables() {

	draggables.forEach( draggable => {

		const object = draggable.mesh;
		switch ( draggable.state ) {

			case 'to-be-attached':
				draggable.attachedPointer.children[ 0 ].attach( object );
				draggable.state = 'attached';
				break;

			case 'to-be-detached':
				draggable.originalParent.attach( object );
				draggable.state = 'detached';
				break;

			default:
				object.scale.set( 1, 1, 1 );

		}

	} );

}

function updateHandRays() {

	handPointers.forEach( hp => {

		let distance = null;
		let intersectingMesh = null;

		intersectables.forEach( object => {

			const intersections = hp.intersectObject( object, false );
			if ( intersections && intersections.length > 0 ) {

				if ( distance == null || intersections[ 0 ].distance < distance ) {

					distance = intersections[ 0 ].distance;
					intersectingMesh = object;

				}

			}

		} );

		if ( distance ) {

			hp.setCursor( distance );

			const button = buttons.find( button => button.mesh === intersectingMesh );
			if ( button !== undefined ) {

				if ( hp.isPinched() ) {

					button.currState = 'pressed';

				} else if ( button.currState != 'pressed' ) {

					button.currState = 'hovered';

				}

			}

			const draggable = draggables.find( draggable => draggable.mesh === intersectingMesh );
			if ( draggable !== undefined ) {

				intersectingMesh.scale.set( 1.1, 1.1, 1.1 );

				if ( hp.isPinched() ) {

					if ( ! hp.isAttached() && draggable.state != 'attached' && draggable.state != 'controller' ) {

						draggable.state = 'to-be-attached';
						draggable.attachedPointer = hp;
						hp.setAttached( true );

					}

				} else {

					if ( hp.isAttached() && draggable.state == 'attached' ) {

						draggable.state = 'to-be-detached';
						draggable.attachedPointer = null;
						hp.setAttached( false );

					}

				}

			}

		} else {

			hp.setCursor( 1.5 );

		}

	} );

}

function updateButtons() {

	buttons.forEach( button => {

		if ( button.currState == 'none' ) {

			button.mesh.scale.set( 1, 1, 1 );

		} else {

			button.mesh.scale.set( 1.1, 1.1, 1.1 );

		}

		if ( button.currState == 'pressed' && button.prevState != 'pressed' ) {

			button.action();

		}

		// conserva prevState, limpia currState (updateHandRays lo actualiza)
		button.prevState = button.currState;
		button.currState = 'none';

	} );

}

function animate() {

	renderer.xr.updateCamera( camera );
	calibrateMenu();
	updateInstructionText();
	updateDraggables();
	updateHandRays();
	updateButtons();
	renderer.render( scene, camera );

}
