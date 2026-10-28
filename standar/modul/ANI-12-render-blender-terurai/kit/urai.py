# ANI-12: model berkomponen diurai sepanjang satu sumbu, kamera dan lampu
# terkunci, dirender ke PNG beralfa untuk ke-bingkai.sh.
#
#   blender -b --python urai.py -- <model.glb|gltf> <folder PNG> #     --sumbu "Mat A,Mat B" [--tetap "Mat C"] [--angkat "Mat D"] [--buang "Mat E"] #     [--jumlah 60] [--lebar 1280] [--tinggi 720]
#
# Komponen = bagian lepas (loose parts) setelah dipisah per material. Material
# --sumbu bergeser lurus sepanjang garis dari pusat bagian tetap ke pusat
# kelompok sumbu, sebanding posisinya di garis itu (teleskop); --angkat naik
# lurus; --buang dikeluarkan dari adegan (aksesori yang melebarkan bingkai);
# sisanya tetap. Bagian bermaterial sumbu yang pusatnya jauh dari garis sumbu
# ikut bagian tetap (mis. jendela pembidik bermaterial kaca lensa). Tanpa
# rotasi: hanya translasi, seperti aturan gerak ANI-01.
import argparse
import math
import sys

import bpy
from bpy_extras import anim_utils
from mathutils import Vector

ap = argparse.ArgumentParser(prog="urai.py")
ap.add_argument("model")
ap.add_argument("keluar")
ap.add_argument("--sumbu", required=True)
ap.add_argument("--tetap", default="")
ap.add_argument("--angkat", default="")
ap.add_argument("--buang", default="")
ap.add_argument("--jumlah", type=int, default=60)
ap.add_argument("--lebar", type=int, default=1280)
ap.add_argument("--tinggi", type=int, default=720)
a = ap.parse_args(sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else [])
daftar = lambda t: {x.strip() for x in t.split(",") if x.strip()}
model, keluar, jumlah, lebar, tinggi = a.model, a.keluar, a.jumlah, a.lebar, a.tinggi
SUMBU, ANGKAT, BUANG = daftar(a.sumbu), daftar(a.angkat), daftar(a.buang)
TETAP_DIMINTA = daftar(a.tetap)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=model)


def pisah(tipe):
    for o in [o for o in bpy.context.scene.objects if o.type == "MESH"]:
        bpy.ops.object.select_all(action="DESELECT")
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.mesh.separate(type=tipe)
        bpy.ops.object.mode_set(mode="OBJECT")


pisah("MATERIAL")
pisah("LOOSE")
for o in [o for o in bpy.context.scene.objects if o.type == "MESH" and o.material_slots and o.material_slots[0].material.name in BUANG]:
    bpy.data.objects.remove(o)
bagian = [o for o in bpy.context.scene.objects if o.type == "MESH"]


def pusat_dunia(objs):
    t = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
    mn = Vector((min(p.x for p in t), min(p.y for p in t), min(p.z for p in t)))
    mx = Vector((max(p.x for p in t), max(p.y for p in t), max(p.z for p in t)))
    return (mn + mx) / 2, (mx - mn)


def mat(o):
    return o.material_slots[0].material.name if o.material_slots else ""


ada = {mat(o) for o in bagian}
hilang = (SUMBU | ANGKAT | TETAP_DIMINTA) - ada
if hilang:
    sys.exit(f"material tidak ada di model: {sorted(hilang)}; yang ada: {sorted(ada)}")
tetap = [o for o in bagian if mat(o) not in SUMBU | ANGKAT]
sumbu = [o for o in bagian if mat(o) in SUMBU]
angkat = [o for o in bagian if mat(o) in ANGKAT]
print("KELOMPOK tetap", len(tetap), "sumbu", len(sumbu), "angkat", len(angkat))

p_tetap, ukuran_tetap = pusat_dunia(tetap)
p_sumbu, _ = pusat_dunia(sumbu)
arah = (p_sumbu - p_tetap).normalized()
# Material saja tidak cukup: jendela pembidik di bodi juga bermaterial lensa.
# Bagian yang pusatnya jauh dari garis sumbu lensa ikut bodi.
def dari_sumbu(o):
    v = pusat_dunia([o])[0] - p_sumbu
    return (v - arah * v.dot(arah)).length
jari = max(max(pusat_dunia([o])[1]) for o in sumbu) / 2
lepas = [o for o in sumbu if dari_sumbu(o) > jari * 0.9]
sumbu = [o for o in sumbu if o not in lepas]
tetap += lepas
print("PINDAH KE BODI", len(lepas))
# Posisi tiap bagian di sumbu, dinormalkan 0..1 dari yang terdekat ke bodi.
pos = {o.name: (pusat_dunia([o])[0] - p_tetap).dot(arah) for o in sumbu}
lo, hi = min(pos.values()), max(pos.values())
jauh = max(ukuran_tetap) * 1.6

for o in bagian:
    o.keyframe_insert("location", frame=0)
for o in sumbu:
    t = (pos[o.name] - lo) / ((hi - lo) or 1)
    o.location = o.location + arah * (0.15 + 0.85 * t) * jauh
for o in angkat:
    o.location = o.location + Vector((0, 0, 1)) * max(ukuran_tetap) * 0.9
for o in bagian:
    o.keyframe_insert("location", frame=jumlah - 1)
    ad = o.animation_data
    for fc in anim_utils.action_get_channelbag_for_slot(ad.action, ad.action_slot).fcurves:
        for k in fc.keyframe_points:
            k.interpolation = "LINEAR"

# Semua sudut kotak tiap bagian di keadaan utuh dan terurai, untuk membingkai kamera.
sudut = []
for f in (0, jumlah - 1):
    bpy.context.scene.frame_set(f)
    bpy.context.view_layer.update()
    sudut += [o.matrix_world @ Vector(c) for o in bagian for c in o.bound_box]
bpy.context.scene.frame_set(0)
pusat = sum(sudut, Vector()) / len(sudut)

# Cek interpolasi: bagian yang paling jauh bergerak harus maju rata per bingkai.
uji = max(sumbu, key=lambda o: pos[o.name])
jejak = []
for f in range(jumlah):
    bpy.context.scene.frame_set(f)
    jejak.append(round((uji.matrix_world.translation - p_tetap).dot(arah), 4))
bpy.context.scene.frame_set(0)
print("JEJAK", jejak)

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
dunia.node_tree.nodes["Background"].inputs["Color"].default_value = (0.85, 0.85, 0.83, 1)
dunia.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.8
scene.world = dunia
for nama, e, rot in (("kunci", 3.0, (50, 0, 35)), ("isi", 1.2, (65, 0, -120))):
    d = bpy.data.lights.new(nama, "SUN")
    d.energy = e
    o = bpy.data.objects.new(nama, d)
    o.rotation_euler = [math.radians(r) for r in rot]
    scene.collection.objects.link(o)

# Kamera 3/4: tegak lurus sumbu urai supaya semua komponen terlihat berjajar.
kam = bpy.data.objects.new("kamera", bpy.data.cameras.new("kamera"))
kam.data.lens = 50
scene.collection.objects.link(kam)
scene.camera = kam
samping = arah.cross(Vector((0, 0, 1))).normalized()
arah_kam = (samping * 0.85 - arah * 0.35 + Vector((0, 0, 0.35))).normalized()
kam.rotation_euler = (-arah_kam).to_track_quat("-Z", "Y").to_euler()
bpy.context.view_layer.update()
dg = bpy.context.evaluated_depsgraph_get()
lokasi, _ = kam.camera_fit_coords(dg, [v for c in sudut for v in c])
# Mundur 30% dari posisi pas supaya komponen tidak menempel ke tepi.
kam.location = pusat + (lokasi - pusat) * 1.3
scene.render.filepath = keluar.rstrip("/\\") + "/r-"
bpy.ops.render.render(animation=True)
print("SELESAI", jumlah, "bingkai", "arah", tuple(round(v, 3) for v in arah))
