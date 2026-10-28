# ANI-12: model satu potong (tidak bisa diurai) dirender berputar satu
# lingkaran ke PNG beralfa untuk ke-bingkai.sh. --clay mengganti material
# dengan abu doff, untuk model yang materialnya transparan.
#
#   blender -b --python orbit.py -- <model.glb> <folder PNG> [jumlah] [lebar] [tinggi] [--clay]
import math
import sys

import bpy
from bpy_extras import anim_utils
from mathutils import Vector

argv = [x for x in sys.argv[sys.argv.index("--") + 1 :] if x != "--clay"]
clay_diminta = "--clay" in sys.argv
model, keluar = argv[0], argv[1]
jumlah = int(argv[2]) if len(argv) > 2 else 60
lebar = int(argv[3]) if len(argv) > 3 else 1280
tinggi = int(argv[4]) if len(argv) > 4 else 720

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=model)
objek = [o for o in bpy.context.scene.objects if o.type == "MESH"]

# Pusat dan ukuran dari bounding box dunia, supaya kamera tidak ditebak.
titik = [o.matrix_world @ Vector(c) for o in objek for c in o.bound_box]
mn = Vector((min(p.x for p in titik), min(p.y for p in titik), min(p.z for p in titik)))
mx = Vector((max(p.x for p in titik), max(p.y for p in titik), max(p.z for p in titik)))
pusat = (mn + mx) / 2
radius = (mx - mn).length / 2

# Warna per verteks (Hunyuan3D) dipakai langsung bila material belum membacanya.
for o in objek:
    attr = o.data.color_attributes
    if not attr:
        continue
    for slot in o.material_slots:
        m = slot.material
        if not m or not m.use_nodes:
            continue
        nt = m.node_tree
        bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if bsdf and not bsdf.inputs["Base Color"].is_linked:
            ca = nt.nodes.new("ShaderNodeVertexColor")
            ca.layer_name = attr[0].name
            nt.links.new(ca.outputs["Color"], bsdf.inputs["Base Color"])

# --clay: ganti material dengan abu doff buram, untuk model yang materialnya
# transparan atau tembus pandang supaya bentuknya terbaca.
if clay_diminta:
    clay = bpy.data.materials.new("clay")
    clay.use_nodes = True
    b = clay.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (0.32, 0.33, 0.35, 1)
    b.inputs["Roughness"].default_value = 0.55
    for o in objek:
        o.data.materials.clear()
        o.data.materials.append(clay)

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x, scene.render.resolution_y = lebar, tinggi
scene.render.film_transparent = True
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.view_settings.view_transform = "Standard"
scene.frame_start, scene.frame_end = 0, jumlah - 1

dunia = bpy.data.worlds.new("latar")
dunia.use_nodes = True
dunia.node_tree.nodes["Background"].inputs["Color"].default_value = (0.8, 0.8, 0.78, 1)
dunia.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.6
scene.world = dunia

def lampu(nama, energi, rot):
    d = bpy.data.lights.new(nama, "SUN")
    d.energy = energi
    o = bpy.data.objects.new(nama, d)
    o.rotation_euler = [math.radians(r) for r in rot]
    scene.collection.objects.link(o)

lampu("kunci", 3.0, (50, 0, 35))
lampu("isi", 1.0, (65, 0, -120))

# Kamera berputar di lingkaran mendatar, sedikit dari atas; lampu tetap di tempat
# supaya yang terlihat berputar memang objeknya, bukan cahayanya.
kam = bpy.data.objects.new("kamera", bpy.data.cameras.new("kamera"))
kam.data.lens = 50
scene.collection.objects.link(kam)
scene.camera = kam
jarak = radius / math.tan(kam.data.angle / 2) * 1.2
target = bpy.data.objects.new("target", None)
target.location = pusat
scene.collection.objects.link(target)
ikut = kam.constraints.new("TRACK_TO")
ikut.target = target
ikut.track_axis, ikut.up_axis = "TRACK_NEGATIVE_Z", "UP_Y"
for f in range(jumlah):
    sudut = 2 * math.pi * f / jumlah
    kam.location = pusat + Vector((math.cos(sudut) * jarak, math.sin(sudut) * jarak, jarak * 0.25))
    kam.keyframe_insert("location", frame=f)
# Gerak linier: kecepatan putar sama dengan kecepatan gulir. Blender 5: aksi
# berlapis, F-curve ada di channelbag slot, bukan action.fcurves.
ad = kam.animation_data
for fc in anim_utils.action_get_channelbag_for_slot(ad.action, ad.action_slot).fcurves:
    for k in fc.keyframe_points:
        k.interpolation = "LINEAR"

scene.render.filepath = keluar.rstrip("/\\") + "/r-"
bpy.ops.render.render(animation=True)
print("SELESAI", jumlah, "bingkai", "pusat", tuple(round(v, 3) for v in pusat), "radius", round(radius, 3))
