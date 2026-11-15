# body.glb — attribution

3D anatomy: BodyParts3D, © The Database Center for Life Science licensed under CC Attribution 4.0 International (https://creativecommons.org/licenses/by/4.0/)

- Source: https://dbarchive.biosciencedbc.jp/data/bodyparts3d/LATEST/README_e.html
- Release: BodyParts3D 4.0 (3D data dated 2013-06-19; licence updated to CC BY 4.0 on 2025-02-25)
- Files used: `partof_BP3D_4.0_obj_99.zip` (PART-OF tree, 99 % polygon-reduced OBJ), `partof_element_parts.txt`, `partof_parts_list_e.txt`, and two meshes from `isa_BP3D_4.0_obj_99.zip` (IS-A tree): FJ2561 Spleen and FJ2811 External ear.

`body.glb` is an adapted work. It is not the original BodyParts3D data, and DBCLS does not endorse it.

## Modifications

1. **Selection.** Only some element meshes were kept, grouped into 8 region nodes (top-level scene children):
   - `skin`: FJ2810 Skin (whole-body surface).
   - `head`: brain (FMA50801): cerebral gyri and lobes, subcortex, hippocampus, cerebellum, midbrain, pons, medulla, hypothalamus, pineal body. The ventricles and the aqueduct were dropped.
   - `eyes`: right and left eyeball (FMA12514/12515): sclera, cornea, iris, choroid, lens, vitreous body, anterior chamber.
   - `inner_ear`: FJ2811 External ear (both auricles, IS-A tree). It stands in for the inner ear because BodyParts3D 4.0 has no cochlea, vestibule or semicircular-canal meshes in either tree.
   - `heart`: heart (FMA7088) minus the blood-cavity meshes. Sub-primitives: myocardium, coronary arteries, cardiac veins, valves.
   - `lungs`: trachea, main bronchi, the bronchial trees and the intrapulmonary pulmonary arteries and veins (FMA7309/7310/7394/7395/7396). BodyParts3D 4.0 has no lung parenchyma, lobe surface or pleura meshes. Sub-primitives: airway, pulmonary_artery, pulmonary_vein.
   - `torso`: liver (hepatovenous segments and caudate lobe), stomach, duodenum, jejunum, ileum, cecum, colon, rectum, kidneys, pancreas, and the spleen (FJ2561, from the IS-A tree because the PART-OF tree has no spleen). Intra-organ vessels and ducts were dropped.
   - `musculoskeletal`: 239 skeletal elements: skull bones, mandible, hyoid, vertebrae, intervertebral discs, sacrum, ribs, costal cartilages, sternum, clavicles, scapulae, hip bones, and all upper- and lower-limb bones including hands and feet. No muscles.
2. **Merging.** The element meshes of each region were merged into one mesh per region (one primitive per sub-group). Each node's `extras.elements` lists the BodyParts3D file IDs used.
3. **Re-orientation and scaling.** Converted from BodyParts3D Z-up millimetres (front = −Y) to glTF Y-up metres. The figure faces +Z with its anatomical left at +X. The feet are at y = 0 and the figure is centred on x = z = 0.
4. **Skin outer shell.** The BodyParts3D skin is a thick shell with an outer and an inner surface. Only the outward-facing outer surface was kept (selected by a ray-parity test).
5. **Neutral groin.** At the user's request, the external genital surface was removed from the `skin` mesh (5,899 faces). The opening was closed with a smooth, faired, mannequin-like surface (4,874 new faces) and the surrounding groin skin was smoothed. Internal anatomy is unchanged.
6. **Skin containment.** A few skeleton vertices poked through the skin, mainly at the xiphoid process (at most 0.78 mm). Those vertices, and any within 1.5 mm of the skin (72 in total), were moved to 1.5 mm inside the skin surface. The `inner_ear` auricle mesh was moved 0.8 mm inward along its normals so it does not z-fight with the skin.
7. **Simplification.** Per-element mesh simplification with meshoptimizer: skin kept at full resolution, brain about 15 %, eyes about 6 %, heart about 45 %, lungs about 40 %, abdominal organs about 25 %, skeleton about 20 %. Smooth vertex normals were recomputed.
8. **Compression.** Positions quantised to 14 bits and normals to 8 bits (`KHR_mesh_quantization`), then compressed with `EXT_meshopt_compression` using glTF-Transform 4.5.1. Simple PBR default materials were added per region and sub-group.
