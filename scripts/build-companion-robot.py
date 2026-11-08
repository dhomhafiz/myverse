"""Original MyVerse desk companion. Run with Blender 5.2 --background --python this_file.

Metres, Blender Z-up / front -Y; glTF exporter converts to Y-up / front +Z.
No external images, fonts, add-ons or copyrighted character geometry are used.
"""
import bpy
import math
import json
import sys
from pathlib import Path
from mathutils import Vector, Matrix

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'assets/companion-robot'
REVIEW = ROOT / 'artifacts/companion-robot'
for folder in (SOURCE, REVIEW):
    folder.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)


def material(name, color, metal=0, rough=0.4, emission=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    bs = m.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value = (*color, 1)
    bs.inputs['Metallic'].default_value = metal
    bs.inputs['Roughness'].default_value = rough
    if emission:
        bs.inputs['Emission Color'].default_value = (*color, 1)
        bs.inputs['Emission Strength'].default_value = emission
    return m


WHITE = material('ceramic_white_metal', (0.83, 0.86, 0.88), 0.28, 0.3)
PANEL = material('porcelain_panel', (0.95, 0.96, 0.97), 0.13, 0.34)
GREY = material('brushed_grey_alloy', (0.30, 0.34, 0.38), 0.68, 0.36)
DARK = material('graphite_mechanism', (0.047, 0.061, 0.075), 0.52, 0.43)
RUBBER = material('clean_track_rubber', (0.022, 0.028, 0.035), 0.03, 0.77)
GLASS = material('obsidian_eye_lens', (0.006, 0.016, 0.028), 0.3, 0.18)
CYAN = material('welcome_cyan', (0.012, 0.57, 0.94), 0.12, 0.28, 2.2)
DIM = material('status_cyan_dim', (0.01, 0.20, 0.35), 0.2, 0.34, 0.65)


def joint(name, position, parent=None, axis=None, limits=None):
    o = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(o)
    o.empty_display_type = 'ARROWS'
    o.empty_display_size = 0.025
    o.location = position
    if parent:
        world = o.matrix_world.copy()
        bpy.context.view_layer.update()
        world = Matrix.Translation(Vector(position))
        o.parent = parent
        o.matrix_parent_inverse = Matrix.Identity(4)
        o.location = parent.matrix_world.inverted() @ Vector(position)
    if axis:
        o['gltf_rotation_axis'] = axis
        o['rotation_limits_degrees'] = limits
    return o


robot = joint('companion_root', (0, 0, 0))
robot['brand'] = 'dhomhafiz.dev'
robot['units'] = 'metres; glTF Y-up; front +Z; origin at track contact plane'
robot['design'] = 'Original clean service utility robot; rigid object hierarchy, no skinning required'
base = joint('chassis', (0, 0, 0), robot)
left_track = joint('track_left', (0.102, 0, 0.05), base)
right_track = joint('track_right', (-0.102, 0, 0.05), base)
neck_roll = joint('neck_roll', (0, 0.012, 0.227), base, 'Z', [-15, 15])
neck_pitch = joint('neck_pitch', (0, 0.022, 0.268), neck_roll, 'X', [-35, 45])
head_yaw = joint('head_yaw', (0, -0.002, 0.316), neck_pitch, 'Y', [-180, 180])
# The existing mobile camera measures this group's geometry, not only its origin.
head = joint('head_pivot', (0, -0.002, 0.347), head_yaw)
shoulders = {}
elbows = {}
wrists = {}
for side, sign in [('left', 1), ('right', -1)]:
    shoulders[side] = joint('shoulder_' + side, (sign * 0.119, 0, 0.211), base, 'Z', [-120, 120])
    elbows[side] = joint('elbow_' + side, (sign * 0.139, -0.008, 0.153), shoulders[side], 'X', [-135, 0])
    wrists[side] = joint('wrist_' + side, (sign * 0.145, -0.017, 0.092), elbows[side], 'Y', [-180, 180])
bpy.context.view_layer.update()


def finish(o, name, mat, parent):
    o.name = name
    o.data.materials.clear()
    o.data.materials.append(mat)
    bpy.context.view_layer.update()
    world = o.matrix_world.copy()
    o.parent = parent
    o.matrix_world = world
    return o


def cube(name, center, size, mat, parent=base, bevel=0.003):
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    o = bpy.context.object
    o.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        mod = o.modifiers.new('machined_edge_radius', 'BEVEL')
        mod.width = bevel
        mod.segments = 3
        bpy.ops.object.modifier_apply(modifier=mod.name)
    for p in o.data.polygons:
        p.use_smooth = True
    normals = o.modifiers.new('weighted_machined_normals', 'WEIGHTED_NORMAL')
    normals.keep_sharp = True
    bpy.ops.object.modifier_apply(modifier=normals.name)
    return finish(o, name, mat, parent)


def cylinder(name, center, radius, depth, mat, parent=base, axis='X', vertices=24):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=center)
    o = bpy.context.object
    o.rotation_euler = (0, math.pi / 2, 0) if axis == 'X' else (math.pi / 2, 0, 0)
    for p in o.data.polygons:
        p.use_smooth = len(p.vertices) == 4
    return finish(o, name, mat, parent)


def rod(name, start, end, radius, mat, parent):
    start, end = Vector(start), Vector(end)
    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=radius, depth=(end - start).length, location=(start + end) / 2)
    o = bpy.context.object
    o.rotation_euler = (end - start).to_track_quat('Z', 'Y').to_euler()
    return finish(o, name, mat, parent)


def tube(name, coords, radius, mat, parent):
    curve = bpy.data.curves.new(name, 'CURVE')
    curve.dimensions = '3D'
    curve.resolution_u = 1
    curve.bevel_depth = radius
    curve.bevel_resolution = 2
    spline = curve.splines.new('POLY')
    spline.points.add(len(coords) - 1)
    for p, co in zip(spline.points, coords):
        p.co = (*co, 1)
    o = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(o)
    bpy.context.view_layer.objects.active = o
    o.select_set(True)
    bpy.ops.object.convert(target='MESH')
    return finish(bpy.context.object, name, mat, parent)


# Continuous belts with genuine open centres; individual reusable-profile tread links.
for sign, parent in [(1, left_track), (-1, right_track)]:
    x = sign * 0.102
    path = []
    for end, angles in [(0.052, range(-90, 91, 9)), (-0.052, range(90, 271, 9))]:
        for degrees in angles:
            a = math.radians(degrees)
            path.append((end + math.cos(a) * 0.047, 0.051 + math.sin(a) * 0.047))
    verts, faces = [], []
    for yy, zz in path:
        # Ring cross section: outside left/right then inset inner left/right.
        dy, dz = yy - (0.052 if yy > 0 else -0.052), zz - 0.051
        length = math.hypot(dy, dz)
        iy, iz = yy - dy / length * 0.007, zz - dz / length * 0.007
        verts.extend([(x - 0.026, yy, zz), (x + 0.026, yy, zz), (x - 0.026, iy, iz), (x + 0.026, iy, iz)])
    for i in range(len(path)):
        a, b = i * 4, (i + 1) % len(path) * 4
        faces.extend([(a, b, b+1, a+1), (a+2, a+3, b+3, b+2), (a, a+2, b+2, b), (a+1, b+1, b+3, a+3)])
    mesh = bpy.data.meshes.new('belt_open_ring')
    mesh.from_pydata(verts, [], faces)
    obj = bpy.data.objects.new('continuous_track_belt', mesh)
    bpy.context.collection.objects.link(obj)
    finish(obj, 'continuous_track_belt', RUBBER, parent)
    # Evenly sample capsule perimeter to avoid overlapping links at the ends.
    perimeter = 0.208 + 2 * math.pi * 0.049
    for i in range(40):
        distance = perimeter * i / 40
        if distance < 0.104:
            yy, zz, tangent = -0.052 + distance, 0.002, 0
        elif distance < 0.104 + math.pi * 0.049:
            a = -math.pi/2 + (distance - 0.104) / 0.049
            yy, zz, tangent = 0.052 + math.cos(a)*0.049, 0.051 + math.sin(a)*0.049, a+math.pi/2
        elif distance < 0.208 + math.pi * 0.049:
            yy, zz, tangent = 0.052 - (distance - 0.104 - math.pi*0.049), 0.100, math.pi
        else:
            a = math.pi/2 + (distance - 0.208 - math.pi*0.049) / 0.049
            yy, zz, tangent = -0.052 + math.cos(a)*0.049, 0.051 + math.sin(a)*0.049, a+math.pi/2
        o = cube('track_link', (x, yy, zz), (0.058, 0.010, 0.006), GREY if i % 5 == 0 else RUBBER, parent, 0.0009)
        o.rotation_euler.x = tangent
    for yy, zz, rr in [(-0.052, 0.051, 0.038), (0.052, 0.051, 0.038), (0, 0.043, 0.026)]:
        cylinder('wheel_recess', (x, yy, zz), rr, 0.049, DARK, parent)
        for outer in [-1, 1]:
            xx = x + outer * 0.026
            cylinder('alloy_wheel_face', (xx, yy, zz), rr * 0.78, 0.002, GREY, parent)
            cylinder('white_hub', (xx + outer*0.0015, yy, zz), rr*0.57, 0.002, WHITE, parent)
            cylinder('axle_cap', (xx + outer*0.003, yy, zz), rr*0.18, 0.003, DARK, parent, vertices=16)

# Chassis: clean white shell, grey gaskets, inset technology and exact lowercase wordmark.
cube('chassis_undertray', (0, 0.008, 0.09), (0.154, 0.145, 0.058), DARK, bevel=0.012)
cube('body_gasket', (0, 0.008, 0.161), (0.214, 0.142, 0.136), GREY, bevel=0.014)
cube('white_main_shell', (0, 0.008, 0.162), (0.206, 0.137, 0.133), WHITE, bevel=0.011)
cube('top_service_cap', (0, 0.008, 0.231), (0.218, 0.145, 0.012), GREY, bevel=0.004)
cube('front_service_panel_outline', (0, -0.063, 0.144), (0.185, 0.008, 0.082), GREY, bevel=0.009)
cube('front_service_panel', (0, -0.068, 0.145), (0.177, 0.006, 0.074), PANEL, bevel=0.007)
cube('dashboard_inset', (0, -0.063, 0.205), (0.174, 0.009, 0.038), DARK, bevel=0.003)
for x in [-0.068, 0.068]:
    for k in range(4):
        cube('dashboard_vent', (x, -0.069, 0.192 + k*0.007), (0.025, 0.003, 0.0027), GREY, bevel=0.0005)
cube('dashboard_screen', (0.028, -0.069, 0.204), (0.043, 0.002, 0.026), GLASS, bevel=0.001)
for k in range(6):
    h = [0.006, 0.011, 0.017, 0.014, 0.010, 0.020][k]
    cube('telemetry_bar', (0.012+k*0.006, -0.071, 0.193+h/2), (0.003, 0.001, h), CYAN, bevel=0.0003)
cylinder('status_button', (-0.024, -0.070, 0.204), 0.009, 0.002, GREY, axis='Y')
cylinder('status_button_light', (-0.024, -0.072, 0.204), 0.004, 0.002, CYAN, axis='Y')
for x in [-0.063, 0.063]:
    cube('bumper_light_gasket', (x, -0.068, 0.104), (0.042, 0.009, 0.012), DARK, bevel=0.003)
    cube('bumper_light', (x, -0.074, 0.104), (0.032, 0.003, 0.004), CYAN, bevel=0.001)
for x in [-0.081, 0.081]:
    for z in [0.117, 0.173]:
        cylinder('panel_fastener', (x, -0.073, z), 0.0022, 0.0012, GREY, axis='Y', vertices=12)
for x in [-0.072, 0.072]:
    for k in range(7):
        cube('rear_cooling_vent', (x, 0.079, 0.145+k*0.008), (0.039, 0.002, 0.0025), DARK, bevel=0.0004)

bpy.ops.object.text_add(location=(0, -0.072, 0.141))
text = bpy.context.object
text.data.body = 'dhomhafiz.dev'
text.data.align_x = 'CENTER'
text.data.align_y = 'CENTER'
text.data.size = 0.019
text.data.extrude = 0.00012
text.data.resolution_u = 4
text.rotation_euler = (math.pi / 2, 0, 0)
finish(text, 'wordmark_dhomhafiz_dev', DARK, base)
bpy.context.view_layer.objects.active = text
bpy.ops.object.convert(target='MESH')

# Two-stage mechanical neck; pivots coincide with visible joint centres.
cylinder('neck_base_socket', (0, 0.012, 0.239), 0.018, 0.031, DARK, neck_roll)
rod('lower_neck_link', (0, 0.012, 0.234), (0, 0.022, 0.268), 0.011, WHITE, neck_roll)
cylinder('neck_pitch_bearing', (0, 0.022, 0.268), 0.016, 0.040, GREY, neck_pitch)
for x in [-0.021, 0.021]:
    cylinder('neck_pitch_cap', (x, 0.022, 0.268), 0.010, 0.003, WHITE, neck_pitch)
rod('upper_neck_link', (0, 0.022, 0.268), (0, -0.002, 0.316), 0.012, WHITE, neck_pitch)
rod('neck_piston', (0.013, 0.025, 0.271), (0.013, 0.009, 0.303), 0.003, GREY, neck_pitch)

# Binocular eye shells, recessed lenses and welcoming upward arcs.
cube('binocular_bridge', (0, -0.002, 0.347), (0.065, 0.049, 0.034), DARK, head, 0.009)
eye_meshes = []
for x in [-0.057, 0.057]:
    cube('eye_shell_outline', (x, -0.006, 0.347), (0.116, 0.071, 0.104), GREY, head, 0.023)
    cube('white_eye_housing', (x, -0.009, 0.348), (0.111, 0.071, 0.098), WHITE, head, 0.022)
    cylinder('lens_alloy_rim', (x, -0.047, 0.348), 0.044, 0.009, GREY, head, 'Y', 40)
    cylinder('lens_dark_seal', (x, -0.053, 0.348), 0.0405, 0.006, DARK, head, 'Y', 40)
    cylinder('eye_optical_face', (x, -0.057, 0.348), 0.037, 0.004, GLASS, head, 'Y', 48)
    coords = [(x + math.cos(a)*0.017, -0.0605, 0.344 + math.sin(a)*0.017) for a in [math.radians(18+i*6) for i in range(25)]]
    eye_meshes.append(tube('eye_smile', coords, 0.0025, CYAN, head))
    for dx, dz in [(-0.041, 0.032), (0.041, 0.032), (-0.041, -0.032), (0.041, -0.032)]:
        cylinder('eye_housing_screw', (x+dx, -0.043, 0.348+dz), 0.0018, 0.001, DARK, head, 'Y', 12)
cube('eye_side_indicator', (-0.116, -0.007, 0.347), (0.002, 0.022, 0.018), DIM, head, 0.001)

for side, sign in [('left', 1), ('right', -1)]:
    shoulder, elbow, wrist = shoulders[side], elbows[side], wrists[side]
    cylinder('shoulder_socket', (sign*0.119, 0, 0.211), 0.018, 0.024, DARK, shoulder)
    rod('upper_arm_gasket', (sign*0.124, -0.001, 0.204), (sign*0.139, -0.008, 0.159), 0.013, GREY, shoulder)
    rod('upper_arm_shell', (sign*0.126, -0.001, 0.200), (sign*0.137, -0.007, 0.166), 0.0135, WHITE, shoulder)
    cylinder('elbow_bearing', (sign*0.139, -0.008, 0.153), 0.015, 0.029, GREY, elbow)
    cylinder('elbow_dark_inset', (sign*0.155, -0.008, 0.153), 0.010, 0.003, DARK, elbow)
    rod('forearm_core', (sign*0.139, -0.008, 0.149), (sign*0.145, -0.017, 0.099), 0.011, DARK, elbow)
    rod('forearm_white_shell', (sign*0.140, -0.010, 0.143), (sign*0.144, -0.016, 0.105), 0.014, WHITE, elbow)
    cylinder('wrist_coupling', (sign*0.145, -0.017, 0.092), 0.009, 0.028, DARK, wrist)
    cube('palm', (sign*0.145, -0.018, 0.080), (0.032, 0.020, 0.022), GREY, wrist, 0.003)
    for dx in [-0.009, 0.009]:
        cube('gripper_finger', (sign*0.145+dx, -0.018, 0.063), (0.014, 0.022, 0.028), PANEL, wrist, 0.003)
        cube('grip_pad', (sign*0.145+dx, -0.031, 0.063), (0.011, 0.002, 0.015), DARK, wrist, 0.0007)

# Bake geometry into its rigid joint frame, then batch by shared material per joint.
bpy.context.view_layer.update()
meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
for o in meshes:
    parent = o.parent
    o.data.transform(parent.matrix_world.inverted() @ o.matrix_world)
    o.matrix_parent_inverse = Matrix.Identity(4)
    o.matrix_basis = Matrix.Identity(4)
groups = {}
for o in meshes:
    # Eye expressions stay a separate mesh for the existing blink/pupil controller.
    key = (o.parent.name, 'eyes_cyan' if o in eye_meshes else o.data.materials[0].name)
    groups.setdefault(key, []).append(o)
for (parent_name, mat_name), objects in groups.items():
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    objects[0].name = 'head_pivot_eyes_cyan' if mat_name == 'eyes_cyan' else parent_name + '__' + mat_name
    # Explicit triangulation makes exported triangle validation deterministic.
    mod = objects[0].modifiers.new('triangulate_for_web', 'TRIANGULATE')
    bpy.ops.object.modifier_apply(modifier=mod.name)

# Relaxed asymmetrical rest pose; all arm motion remains on the original pivots.
shoulders['left'].rotation_euler.y = math.radians(-5)
shoulders['right'].rotation_euler.y = math.radians(4)
elbows['left'].rotation_euler.x = math.radians(-16)
elbows['right'].rotation_euler.x = math.radians(-12)
wrists['left'].rotation_euler.z = math.radians(6)
wrists['right'].rotation_euler.z = math.radians(-4)
neck_pitch.rotation_euler.x = math.radians(-4)
head_yaw.rotation_euler.z = math.radians(-2)
bpy.context.view_layer.update()

# Asset contact plane is exactly zero, independent of tiny tread edge bevels.
all_meshes = [o for o in robot.children_recursive if o.type == 'MESH']
min_z = min((o.matrix_world @ Vector(c)).z for o in all_meshes for c in o.bound_box)
for child in robot.children:
    child.location.z -= min_z
bpy.context.view_layer.update()

target = ROOT / 'public/models/myverse_companion_robot_v2.glb'
bpy.ops.object.select_all(action='DESELECT')
robot.select_set(True)
for o in robot.children_recursive:
    o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(target), export_format='GLB', use_selection=True,
    export_yup=True, export_apply=True, export_extras=True, export_animations=False,
    export_cameras=False, export_lights=False, export_materials='EXPORT')

# Source retains editable rigid joints and a separate studio collection for review.
studio = bpy.data.collections.new('REVIEW_STUDIO_not_exported')
bpy.context.scene.collection.children.link(studio)
def studio_object(o):
    for c in list(o.users_collection):
        c.objects.unlink(o)
    studio.objects.link(o)

bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -0.002))
floor = bpy.context.object
floor.data.materials.append(material('studio_floor', (0.12, 0.15, 0.18), 0.1, 0.5))
studio_object(floor)
for location, energy, size in [((0.8, -1.0, 1.2), 55, 0.85), ((-0.8, -0.4, 0.6), 35, 0.7), ((0.2, 0.8, 1), 65, 0.6)]:
    bpy.ops.object.light_add(type='AREA', location=location)
    light = bpy.context.object
    light.data.energy, light.data.shape, light.data.size = energy, 'DISK', size
    light.rotation_euler = (Vector((0, 0, 0.2))-light.location).to_track_quat('-Z', 'Y').to_euler()
    studio_object(light)
bpy.ops.object.camera_add(location=(0.64, -1.1, 0.60))
camera = bpy.context.object
camera.rotation_euler = (Vector((0, 0, 0.21))-camera.location).to_track_quat('-Z', 'Y').to_euler()
camera.data.type, camera.data.ortho_scale = 'ORTHO', 0.60
studio_object(camera)
scene = bpy.context.scene
scene.camera = camera
scene.render.engine = 'CYCLES'
scene.cycles.samples = 32
scene.cycles.use_denoising = True
scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage = 1200, 1200, 100
scene.world.color = (0.22, 0.22, 0.22)
scene.view_settings.view_transform = 'AgX'
scene.render.image_settings.file_format = 'PNG'
scene.render.filepath = str(REVIEW / 'robot-studio.png')
bpy.context.preferences.filepaths.save_version = 0
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE / 'myverse_companion_robot.blend'))
triangles = sum(len(o.data.polygons) for o in all_meshes)
(REVIEW / 'blender-build.json').write_text(json.dumps({'triangles': triangles, 'meshes': len(all_meshes),
    'materials': 8, 'textures': 0, 'glb_bytes': target.stat().st_size, 'source': 'assets/companion-robot/myverse_companion_robot.blend'}, indent=2))
if '--skip-render' not in sys.argv:
    bpy.ops.render.render(write_still=True)
print('ROBOT_BUILD_COMPLETE', triangles, target.stat().st_size)
