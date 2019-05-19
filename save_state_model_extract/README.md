# Colony Wars Red Sun Ripper

## **Reading save states to rip models is now obsolete**, [extract resources](https://github.com/suXinjke/RedSunRipper/tree/master/game_rsc_extract) and [convert models](https://github.com/suXinjke/RedSunRipper/tree/master/model_converter) with linked scripts

## This program reads ePSXe save states made in **Upgrade ship** menu and rips the selected ship model.

- The output is in [Wavefront .obj](https://en.wikipedia.org/wiki/Wavefront_.obj_file) format.
- Rips are not 100% accurate texture and UV wise - additional manual fixing is required.
- Some ships on this screen miss meshes at their bottom because it's not displayed to player.
- Sometimes both textures are applied to the same face: mostly tiny lights on wings or exhaust effects ship's back. You have to combine both textures yourself to achieve the desired effect.

![This is where save state must be made](https://i.imgur.com/bPFGXir.jpg)
![Output files](https://i.imgur.com/aHealxs.png)

## Usage

Install latest version of node.js and open the root directory in command line

Install all required packages
```
npm install
```

Install Typescript globally to be able to use `tsc`
```
npm install -g typescript
```

Transpile Typescript code into Javascript which will be executed by node.js
```
tsc
```

You now can go into `build` directory and use the ripper
```
cd build
node main.js my_epsxe_save_state ./output_directory
```