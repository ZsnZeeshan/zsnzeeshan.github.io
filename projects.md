---
layout: home
navTag: Projects
order: 2
title: Engineering Projects Portfolio
description: From low-level hardware to cloud — bare-metal embedded, IIoT gateways, BLE sensor networks, high-performance data acquisition, and cloud-connected systems. Projects by Muhammad Zeeshan Arshad.
image:
  path: "/assets/images/icon2.jpg"
  alt: "Personal Logo of Muhammad Zeeshan Arshad"
  width: 1280
  height: 720
last_modified_at: 2026-08-09
#permalink: /projects/
---
## Projects

### **Energy-Efficient Remote Imaging Solution (2022 – 2025)**  
- Engineered an ultra-low-power imaging system utilizing an ESP32 microcontroller and camera module designed for long-term battery-operated deployment with modifications to the ESP32CAM.
- Optimized hardware and firmware power states, implementing deep sleep cycles and hardware gating to minimize quiescent current draw during idle periods.
- Developed a secure data transmission pipeline to encrypt and upload captured images over Wi-Fi/TLS to a remote server while minimizing device uptime.
- Designed a custom 3D-printed enclosure to securely house the electronics, camera lens alignment, and battery power supply for durability.

### **Cloud-Integrated Power Inverter Digitalization (2022 – 2024)**  
- Digitalized Voltranic power inverters by deploying and configuring the open-source inverter_poller application to automatically fetch real-time operational metrics.
- Built a direct telemetry data pipeline to process and store inverter diagnostics (voltage, load, and thermal stats) directly into Prometheus.
- Deployed interactive Grafana dashboards with automated alerting and live status monitoring, early warnings, and historical trend analytics.

### **Kinematic Data Acquisition Framework (2019 – 2023)**  
- Developed an embedded motion analytics framework using a Teensy microcontroller to sample impact metrics via ADXL377 analog sensors.
- Optimized high-frequency ADC sampling routines in embedded firmware to capture rapid, low-latency acceleration data and stream it to a host PC.
- Built a real-time Python application to stream, process, and plot kinematic data feeds directly from the hardware in real-time.
- Implemented localized digital filtering (including FFT) on incoming data to clean up sensor noise and accurately isolate peak impact forces.

### **Smart Building IoT (2021 – 2022)**  
- Developed an IoT gateway using Python to aggregate environmental data and track real-time appliance power consumption from Tuya smart plugs.
- Integrated RuuviTag BLE beacons via the gateway to manage facility security and early mold detection.
- Engineered a dual time-series data pipeline, routing BLE data to Prometheus and power metrics to InfluxDB for optimized storage.
- Designed dynamic Grafana dashboards with automated alerting to track live KPIs, instantly routing security and power anomaly warnings directly to a Telegram channel.

### **Engineering Automation & Technical Mentorship (2020 – 2024)**  
- Led a research initiative to mentor engineers in machine learning while developing custom software tools to automate engineering design workflows.
- Mentored a team of junior engineers in software engineering best practices, guiding them from initial research to the development of practical machine learning applications.
- Developed custom CAD and simulation automation scripts, utilizing reinforcement learning techniques to optimize design parameters and cut down simulation times.
- Supervised internal IT and data systems, ensuring the underlying infrastructure could effectively support data-intensive machine learning training workflows.
- Co-authored with an academic team: *A novel heuristic approach to detect induced forming defects using point cloud scans* ([DOI: 10.1017/pds.2024.75](https://doi.org/10.1017/pds.2024.75)).

### **Intelligent IoT Audio Infrastructure (2017 – 2019)**  
- Built a scalable IoT audio system for smart classrooms, managing real-time data streaming across multiple hardware slave nodes.
- Developed a custom Python-Qt desktop app for spatial sound processing, acoustic mapping, and real-time audio playback.
- Optimized multithreaded tasks to collect, process, and visualize low-latency audio metrics from slave hardware without lagging.
- Designed the network telemetry protocols to ensure reliable, secure communications between the slave audio units and the master control dashboard.

### **Smart Firefighting UGV (2015)**  
- Engineered an 80‑kg armored unmanned ground vehicle (UGV) with stainless steel track belts, achieving a 1 km operational range in various environments.
- Integrated advanced embedded hardware and sensor fusion, enabling real‑time data streaming for enhanced situational awareness.
- Optimized control systems and resource management, resulting in improved reliability and performance under field conditions.
- Implemented secure communication protocols with data corruption detection, ensuring reliable wireless operation.
- Showcased safety features that increased firefighting efficiency and personnel safety compared to manual extinguishing methods.
- Recognized externally (**Karachi Expo, 2016**): The platform drew interest for potential adaptation in maritime firefighting and safety applications at sea.

### **Autonomous Robot (2014)**  
- Designed an autonomous robot capable of obstacle avoidance and line following, demonstrating early interests in embedded systems, control logic, and sensor interfacing.
- Designed a custom SMPS for optimized power delivery and a BMS using lithium batteries for reliable field operation.
- Developed strong troubleshooting practices through hands-on debugging of hardware-software integration issues, skills that proved invaluable throughout my career.

---
