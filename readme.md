# Audio deepfake demo

## Installation
    conda create -n demo python=3.11

### Ubuntu
    pip install numpy
    sudo apt install -y python3-dev python3-pip libwebkit2gtk-4.1-dev libgtk-3-dev libgirepository1.0-dev libcairo2-dev gir1.2-webkit2-4.1
    conda install -c conda-forge libstdcxx-ng
    pip install pywebview[gtk]
    pip install -r requirements.txt

### Windows
    pip install numpy
    pip install pkuseg==0.0.25
    pip install -r requirements.txt