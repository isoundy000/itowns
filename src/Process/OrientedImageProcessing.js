// import * as THREE from 'three';
import LayerUpdateState from '../Core/Layer/LayerUpdateState';
import { CancelledCommandException } from '../Core/Scheduler/Scheduler';
import ObjectRemovalHelper from './ObjectRemovalHelper';
import OrientedImage_Provider from '../Core/Scheduler/Providers/OrientedImage_Provider';

function create3DObject(context, layer, node) {
    if (!node.parent && node.children.length) {
                // if node has been removed dispose three.js resource
        ObjectRemovalHelper.removeChildrenAndCleanupRecursively(layer.id, node);
        return;
    }

    if (!node.visible) {
        return;
    }

    const features = node.children.filter(n => n.layer == layer.id);
    if (features.length > 0) {
        return features;
    }

    if (!layer.tileInsideLimit(node, layer)) {
        return;
    }

    if (node.layerUpdateState[layer.id] === undefined) {
        node.layerUpdateState[layer.id] = new LayerUpdateState();
    }

    const ts = Date.now();

    if (!node.layerUpdateState[layer.id].canTryUpdate(ts)) {
        return;
    }

    node.layerUpdateState[layer.id].newTry();

    const command = {
        layer,
        view: context.view,
        threejsLayer: layer.threejsLayer,
        requester: node,
    };

    context.scheduler.execute(command).then((result) => {
        if (result) {
            node.layerUpdateState[layer.id].success();
            if (!node.parent) {
                ObjectRemovalHelper.removeChildrenAndCleanupRecursively(layer.id, result);
                return;
            }
                    // result coordinayes are in Worl system
                    // update position to be relative to the tile
            result.position.sub(node.extent.center().as(context.view.referenceCrs).xyz());
            result.layer = layer.id;
            node.add(result);
            node.updateMatrixWorld();
        } else {
            node.layerUpdateState[layer.id].failure(1, true);
        }
    },
            (err) => {
                if (err instanceof CancelledCommandException) {
                    node.layerUpdateState[layer.id].success();
                } else if (err instanceof SyntaxError) {
                    node.layerUpdateState[layer.id].failure(0, true);
                } else {
                    node.layerUpdateState[layer.id].failure(Date.now());
                    setTimeout(node.layerUpdateState[layer.id].secondsUntilNextTry() * 1000,
                    () => {
                        context.view.notifyChange(false);
                    });
                }
            });
}

function updateMaterial(context, layer) {
    var orientedImage_Provider = new OrientedImage_Provider();
    orientedImage_Provider.updateMaterial(context.camera.camera3D, context.view.scene, layer);
}


export default {
    update() {
        return function _(context, layer, node) {
            create3DObject(context, layer, node);
            updateMaterial(context, layer);
        };
    },
};