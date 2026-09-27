import bpy
import math
from mathutils import Vector

# Keep existing scene contents intact in a hidden collection.
scene = bpy.context.scene
old = bpy.data.collections.new('Original scene (preserved)')
scene.collection.children.link(old)
for obj in list(scene.objects):
    for collection in list(obj.users_collection):
        collection.objects.unlink(obj)
    old.objects.link(obj)
old.hide_render = True
old.hide_viewport = True
collection = bpy.data.collections.new('Skateboard • complete')
scene.collection.children.link(collection)

def move(obj):
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    collection.objects.link(obj)
    return obj

def material(name, color, metallic=0, roughness=.4):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Metallic'].default_value = metallic
    bsdf.inputs['Roughness'].default_value = roughness
    return m

wood = material('Maple • exposed laminated edge', (.57,.30,.12), 0,.42)
teal = material('Deep petrol • deck underside', (.015,.24,.25), .12,.32)
grip = material('Charcoal • abrasive grip', (.018,.022,.027), 0,.92)
silver = material('Brushed aluminum • trucks', (.52,.58,.63), .85,.27)
black = material('Black steel • hardware', (.025,.03,.035), .75,.27)
cream = material('Warm ivory • urethane', (.92,.86,.67), 0,.43)
orange = material('Burnt orange • bushings and hubs', (.9,.20,.035), .05,.38)
floor_mat = material('Studio • slate', (.095,.12,.145), 0,.8)
nodes = grip.node_tree.nodes
noise = nodes.new('ShaderNodeTexNoise')
noise.inputs['Scale'].default_value = 380
bump = nodes.new('ShaderNodeBump')
bump.inputs['Strength'].default_value = .32
bump.inputs['Distance'].default_value = .012
grip.node_tree.links.new(noise.outputs['Fac'], bump.inputs['Height'])
grip.node_tree.links.new(bump.outputs['Normal'], nodes.get('Principled BSDF').inputs['Normal'])

def finish(obj, name, mat, bevel=0):
    move(obj)
    obj.name = name
    obj.data.materials.append(mat)
    if bevel:
        mod = obj.modifiers.new('Soft manufactured edges', 'BEVEL')
        mod.width = bevel
        mod.segments = 3
        obj.modifiers.new('Weighted normals', 'WEIGHTED_NORMAL')
    return obj

def cube(name, loc, scale, mat, bevel=.025):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    obj = bpy.context.object
    obj.dimensions = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(obj, name, mat, bevel)

def cylinder(name, loc, radius, depth, mat, axis='Z', bevel=.01):
    bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=radius, depth=depth, location=loc)
    obj = bpy.context.object
    if axis == 'Y': obj.rotation_euler[0] = math.pi/2
    if axis == 'X': obj.rotation_euler[1] = math.pi/2
    finish(obj, name, mat, bevel)
    for p in obj.data.polygons: p.use_smooth = True
    return obj

def deck_height(x, y):
    kick = max(0, (abs(x)-2.65)/1.4)
    return 1.22 + .46*kick*kick + .075*(y/1.04)**2

def deck_surface(name, inset, z_offset, mat, thickness):
    # Rounded capsule plan, with longitudinal kick and transverse concave.
    verts, faces = [], []
    nx, ny = 100, 20
    length, width = 4.05-inset, 1.04-inset
    for i in range(nx+1):
        x = -length + 2*length*i/nx
        cap = max(0, abs(x)-(length-width))
        half = max(.003, math.sqrt(max(0, width*width-cap*cap)))
        for j in range(ny+1):
            y = half*(-1+2*j/ny)
            verts.append((x,y,deck_height(x,y)+z_offset))
    for i in range(nx):
        for j in range(ny):
            a = i*(ny+1)+j
            faces.append((a,a+ny+1,a+ny+2,a+1))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name,mesh)
    collection.objects.link(obj)
    obj.data.materials.append(mat)
    for p in mesh.polygons: p.use_smooth = True
    if thickness:
        solid = obj.modifiers.new('Physical deck thickness', 'SOLIDIFY')
        solid.thickness = thickness
        solid.offset = -1
        bevel = obj.modifiers.new('Rounded deck edge','BEVEL')
        bevel.width = .012
        bevel.segments = 2
    return obj

deck = deck_surface('01 • Pressed maple deck',0,0,wood,.12)
deck_surface('02 • Inset grip tape',.045,.012,grip,.008)
deck_surface('03 • Petrol bottom ply',.012,-.121,teal,.009)
for n, offset in enumerate([-.025,-.050,-.075,-.100]):
    deck_surface('Maple ply line %d'%n,.002,offset,wood if n%2 else cream,.006)

for x, label in [(-2.45,'Rear'),(2.45,'Front')]:
    cube(label+' • baseplate',(x,0,1.01),(.67,.59,.14),silver)
    cylinder(label+' • kingpin',(x-.08,0,.86),.075,.37,black)
    cylinder(label+' • lower bushing',(x-.08,0,.81),.16,.13,orange)
    cylinder(label+' • bushing washer',(x-.08,0,.735),.175,.025,silver)
    hanger = cube(label+' • cast hanger',(x,0,.66),(.27,1.62,.23),silver,.10)
    cylinder(label+' • steel axle',(x,0,.56),.066,2.17,silver,'Y')
    for y in [-.21,.21]:
        for dx in [-.23,.23]:
            cylinder(label+' • mounting bolt',(x+dx,y,deck_height(x+dx,y)+.02),.046,.021,black)
            cube(label+' • bolt slot',(x+dx,y,deck_height(x+dx,y)+.032),(.05,.012,.005),silver,.002)
    for side in [-1,1]:
        y = side*1.0
        cylinder(label+' • ivory wheel '+str(side),(x,y,.55),.285,.35,cream,'Y',.055)
        cylinder(label+' • recessed orange hub '+str(side),(x,side*1.181,.55),.135,.013,orange,'Y',.008)
        cylinder(label+' • sealed bearing '+str(side),(x,side*1.191,.55),.09,.018,silver,'Y',.006)
        cylinder(label+' • axle nut '+str(side),(x,side*1.214,.55),.056,.044,black,'Y',.007)

# A small understated grip logo near the tail.
bpy.ops.object.text_add(location=(-2.85,-.29,deck_height(-2.85,0)+.035))
text = finish(bpy.context.object,'Grip • SKATE wordmark',cream)
text.data.body = 'SKATE'
text.data.size = .18
text.data.extrude = .001

cube('Studio floor',(0,0,.17),(200,200,.18),floor_mat,.02)
world = bpy.data.worlds.new('Soft studio world')
scene.world = world
world.use_nodes = True
world.node_tree.nodes['Background'].inputs[0].default_value = (.22,.26,.32,1)
world.node_tree.nodes['Background'].inputs[1].default_value = .45

def aim(obj, target):
    obj.rotation_euler = (Vector(target)-obj.location).to_track_quat('-Z','Y').to_euler()

for name, loc, power, size in [('Key', (0,-5,9),1500,7),('Rim',(2,5,7),1800,6),('Fill',(-6,-1,4),800,5)]:
    bpy.ops.object.light_add(type='AREA',location=loc)
    light = move(bpy.context.object)
    light.name = name+' • softbox'
    light.data.energy = power
    light.data.shape = 'DISK'
    light.data.size = size
    aim(light,(0,0,.8))
bpy.ops.object.camera_add(location=(10,-12,9))
cam = move(bpy.context.object)
cam.name = 'Camera • skateboard hero'
aim(cam,(0,0,.85))
cam.data.type = 'ORTHO'
cam.data.ortho_scale = 10.6
scene.camera = cam
scene.render.engine = 'CYCLES'
scene.cycles.samples = 48
scene.cycles.use_denoising = True
scene.render.resolution_x = 1400
scene.render.resolution_y = 1000
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.filepath = '/Users/pablo/Documents/skrobot_new/artifacts/skateboard/skateboard.png'
for obj in bpy.context.selected_objects: obj.select_set(False)
deck.select_set(True)
bpy.context.view_layer.objects.active = deck
for screen in bpy.data.screens:
    for area in screen.areas:
        if area.type == 'VIEW_3D':
            area.spaces.active.region_3d.view_perspective = 'CAMERA'
bpy.ops.wm.save_as_mainfile(filepath='/Users/pablo/Documents/skrobot_new/artifacts/skateboard/skateboard.blend')
bpy.ops.render.render(write_still=True)
__result__ = {'file': bpy.data.filepath, 'render': scene.render.filepath, 'objects': len(collection.objects)}
