# Human hand camera fixture provenance

`human-hands.y4m` is an adapted test fixture made from three HaGRID photographs of actual adult participants performing these gestures:

| Stage | HaGRID image ID |
|---|---|
| Closed fist | `bee8d104-f5d2-4556-8276-5f0cfe1c0483` |
| Open palm | `7d4ab786-56f9-4e72-b50b-28ee2a038e6c` |
| Thumb-to-index contact (`ok`) | `c53a4fb3-7d60-4aba-9e78-a7f14e64e0de` |

The source photographs came from the HaGRID validation split. The fixture crops out faces and phone-holding hands, retains the photographed gesture hands and their real lighting/backgrounds, mirrors one copy to provide left- and right-hand input, and repositions the panels to exercise movement/view control. The complete Y4M is then horizontally flipped so that MediaPipe's required handedness exchange for non-mirrored camera input maps the movement/jet stages to `Left` and the view/fire stages to `Right`. For the left-move, jet, post-view-neutral, and firing stages, the original photographed right-hand pixels are positioned at normalized screen center in both axes without overlapping the left-hand pixels. The view stage alone offsets the right fist, then returns it to the center before firing. No landmarks or `ControlState` are injected. The resulting 640×480, 3 fps, 60-second sequence is:

1. both fists for 15 seconds plus a 4-second post-calibration fist stage;
2. left fist displacement in one direction for 2 seconds and back for 2 seconds while the right fist remains at screen center;
3. left open palm for 5 seconds of jet activation while the right fist remains at screen center;
4. both fists at neutral for 4 seconds;
5. right fist horizontal/vertical displacement for 3 seconds plus one 3fps frame to produce a view change;
6. both fists at neutral for 2 seconds with the right fist at screen center in both axes;
7. right thumb-to-index contact for the remaining pre-loss stage at screen center in both axes;
8. right-hand absence for 3 seconds of tracking-loss behavior;
9. both fists for 8 seconds of recovery and recalibration.

The fixture is not an original continuous recording and must not be described as proof of natural joint motion. It does exercise the production image-recognition path with real human hand pixels instead of injecting landmarks or `ControlState`.

SHA-256 (`human-hands.y4m`):

`0bda65ae9955af7fb928cbfc2d1898ae70eedc9676016560fc0bf4e25df93ead`

## License and attribution

HaGRID is by Alexander Kapitanov, Karina Kvanchiani, Aleksandr Nagaev, Roman Kraynov, Andrei Makhliarchuk, and contributors:

- Project and attribution: https://github.com/hukenovs/hagrid
- Dataset paper: “HaGRID — HAnd Gesture Recognition Image Dataset,” WACV 2024.
- Source license text: https://github.com/hukenovs/hagrid/blob/master/license/en_us.pdf
- Vendored license text: [`HAGRID_LICENSE.pdf`](./HAGRID_LICENSE.pdf)

SHA-256 (`HAGRID_LICENSE.pdf`):

`14f4845e9c8d3de875cbac4139491da368ab1040a7f565e02894477279134d22`

The HaGRID license is a public attribution/share-alike-style license derived from CC BY-SA 4.0, but explicitly states that it is not a Creative Commons license. This adapted fixture is offered under the same license terms. The fixture is provided as-is, without endorsement by the HaGRID authors or the photographed participants.
