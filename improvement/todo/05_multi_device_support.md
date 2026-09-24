
# Multi device support


Let's improve the way we can pair to a device. When pairing a new device, the user is prompted to select the type  of device to pair before actually pairing it.

Teh type of device we supports:
- Simulator
- FTMS: for any device supporting FTMS
- Wahoo Kikr core: specific for the wahoo kickr core.
  Tech side: Right now it will simply subclass the FTMS one, but if we need any deviation from the specs to make it works, it will live in the specialiation class
  
