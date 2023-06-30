import togglePages from "../../togglePages.js";
import flash from "../../flashmessages/flash.js";
import {getData, getTextData} from "../../request.js";
import deliveryPopUp from "../../popup/deliveryPopUp.js";
import MapRoute from "../../map/map-route.js";
import DeliveryCardLogistic from "../../components/deliveryCard-logistic.js";

// initialize google maps api
window.initMap = MapRoute.initMap;

// toggle pages function
let toggle = new togglePages([
                                {btnId:'pending',pageId:'pendingDeliveryDiv',title:'Pending Deliveries'},
                                {btnId:'completed',pageId:'completedDeliveryDiv',title:'Completed Deliveries'},],
                                'grid');

// initialize variables to store delivery cards and assign buttons
let deliveryCards = [];
let assignBtns = {};

// function to update delivery card onclick function
function updateDeliveryCardsOnclickFunctions() {
    deliveryCards = document.querySelectorAll('.delivery-card');
    for(let i=0;i<deliveryCards.length;i++) {
        let assignBtn = deliveryCards[i].querySelector('.view-btn');
        assignBtn.addEventListener('click', showDeliveryPopUp)
        assignBtns[assignBtn.id] = deliveryCards[i];
    }
}

// calling above function to update delivery card onclick function, when page loads
updateDeliveryCardsOnclickFunctions();

// initialize deliveryPopUp class
const deliverypopup = new deliveryPopUp();

// function to show delivery popup
async  function showDeliveryPopUp(e) {

    // first initialize data needed to fetch delivery details
    const data = {
        deliveryType: e.target.value, //to know whether it is a accepted request,direct donation or ccdonation
        deliveryID: e.target.id, //subdeliveryID
        related: assignBtns[e.target.id].id //ID of the related process
    };

    // fetch data from the back end
    const result = await getData('./delivery/popup', 'POST', { data: data });

    // console.log(result);

    // if error occurs, show error message
    if(!result['status']) {
        flash.showMessage({value: result['message'], type: 'error'});
        return;
    }

    // if no error, get data from the response
    let deliveryData = result['data']
    let drivers = result['drivers']
    const addresses = result['addresses'];

    // console.log(drivers);

    // update deliveryData with start and end addresses
    deliveryData['startAddress'] = addresses[deliveryData['start']];
    deliveryData['endAddress'] = addresses[deliveryData['end']];

    // show delivery popup and store the element in popup variable
    const popup = await deliverypopup.showDeliveryPopUp(deliveryData,e.target.value);

    // If the delivery is not assigned to a driver, remove the driver from the drivers array and show assigned driver in the popup
    if(deliveryData['deliveryStatus'] !== 'Not Assigned' && deliveryData['deliveryStatus'] !== 'Ongoing' && deliveryData['deliveryStatus'] !== 'Completed') {

        // get the div to show reassigned driver
        let reassignDriverDiv = popup.querySelector('#reassignedDriver')

        // get the index of the driver in the drivers array
        const driverIndex = drivers.findIndex(driver => driver['driverID'] === deliveryData['driverID']);

        // update the div with the driver name
        reassignDriverDiv.querySelector('h2').innerHTML = drivers[driverIndex]['name'];

        // remove the driver from the drivers array
        drivers.splice(driverIndex, 1);

        // show the driver's name
        reassignDriverDiv.style.display = 'block';
    }
    // if already assigned, remove the driver scroller card and assign driver button and show the assigned driver
    else if (deliveryData['deliveryStatus'] === 'Ongoing') {

        // get the div to show reassigned driver
        let reassignDriverDiv = popup.querySelector('#reassignedDriver')

        // get the index of the driver in the drivers array
        const driverIndex = drivers.findIndex(driver => driver['driverID'] === deliveryData['driverID']);

        // update the div with the driver name
        reassignDriverDiv.querySelector('h2').innerHTML = drivers[driverIndex]['name'];

        // show the driver's name
        reassignDriverDiv.style.display = 'block';

        popup.querySelector('.driver-selection').remove();
    }
    // if completed, remove the driver scroller card and assign driver button and show the assigned driver, and completed date and time
    else if (deliveryData['deliveryStatus'] === 'Completed') {

        // get the div to show reassigned driver
        let reassignDriverDiv = popup.querySelector('#reassignedDriver')

        // get the index of the driver in the drivers array
        const driverIndex = drivers.findIndex(driver => driver['driverID'] === deliveryData['driverID']);

        // update the div with the driver name
        reassignDriverDiv.querySelector('h2').innerHTML = drivers[driverIndex]['name'];

        // divs to show completed date and time
        const completedDateDiv = document.createElement('div');
        const completedTimeDiv = document.createElement('div');

        // update the divs with the completed date and time
        completedDateDiv.innerHTML = `<h4>Completed Date</h4><p>${deliveryData['completedDate']}</p>`;
        completedTimeDiv.innerHTML = `<h4>Completed Time</h4><p>${deliveryData['completedTime']}</p>`;

        // append the divs to the reassigned driver div
        reassignDriverDiv.parentElement.append(completedDateDiv);
        reassignDriverDiv.parentElement.append(completedTimeDiv);

        // show the driver's name
        reassignDriverDiv.style.display = 'block';

        popup.querySelector('.driver-selection').remove();

    }

    // initialize from and to coordinates to show route in the map
    const from = {lat: parseFloat(deliveryData['fromLatitude']), lng: parseFloat(deliveryData['fromLongitude'])};
    const to = {lat: parseFloat(deliveryData['toLatitude']), lng: parseFloat(deliveryData['toLongitude'])};

    // show route in the map
    const map = await MapRoute.showRoute(from, to, popup.querySelector('#map'));

    // get the distance from the map
    const distance = parseFloat(map['routes'][0]['legs'][0]['distance']['text']);

    // update distance in the popup
    popup.querySelector('#distance').innerHTML = map['routes'][0]['legs'][0]['distance']['text'];

    // if no drivers are available to assign, show the message
    if(!drivers.length > 0) {
        popup.querySelector('#driverSelectionError').innerHTML = 'No drivers available';

        return;
    }

    // const distance = 5.9;

    // add event listener to the assign driver button, if not already assigned
    if (deliveryData['deliveryStatus'] !== 'Ongoing' && deliveryData['deliveryStatus'] !== 'Completed') {
        popup.querySelector('.driver-assign-btn').addEventListener('click', assignDriver);
    } else {
        return;
    }

    // update drivers array with score
    // score is calculated by adding the preference of the driver to no of currently assigned deliveries
    drivers = drivers.map(driver => { driver['score'] = driver['active'] + (driver['preference'] === '< 10km' ? distance >= 10.0 : distance < 10.0); return driver; });

    // sort drivers according to the score => bubble sort
    drivers = sortDrivers(drivers, drivers.length);

    // get the driver scroller div
    const driverScroller = popup.querySelector('#driverScroller');

    // append driver cards to the driver scroller
    drivers.map(driver => {
       driverScroller.appendChild(deliveryPopUp.getDriverCard(driver))
    });

}


//using bubble sort (optimized)
function sortDrivers(drivers, driversCount) {
    let swapped = false;
    for(let i=0;i<driversCount-1;i++) {
        swapped = false;
        for(let j=0;j<driversCount-1;j++) {
            if(drivers[j]['score'] > drivers[j+1]['score']) {
                let temp = drivers[j];
                drivers[j] = drivers[j+1];
                drivers[j+1] = temp;
                swapped = true;
            }
        }
        if(!swapped) {
            break;
        }
    }
    // console.log(drivers);
    return drivers;
}

// function to assign driver
async function assignDriver(e) {

    // get the ids from the event target id = subdeliveryID,processID,related
    const ids = e.target.id.split(',');

    // get the selected driver div
    const selectedDriverDiv = document.getElementById('driverScroller').querySelector('div.selected');
    // console.log(selectedDriverDiv);

    // get the distance to be saved along with subdelivery
    const distance = parseFloat(document.getElementById('distance').innerHTML.split(' ')[0]);

    // if no driver is selected, show error message
    if(!selectedDriverDiv) {
        flash.showMessage({value: 'Please select a driver', type: 'error'});
        return;
    }

    // initialize data to be sent to the backend
    let data = {
        subdeliveryID: ids[0],
        processID: ids[1],
        related: ids[2],
        driverID: selectedDriverDiv.id,
        distance: distance
    }

    // fetch data from the backend after assigning the driver
    const result = await getTextData('./delivery/assign', 'POST', { data });

    console.log(result);

    // if error occurs, show error message
    if(!result['status']) {
        flash.showMessage({value: result['message'], type: 'error'});
        return;
    }

    // if driver is assigned successfully, show the updated cards
    filterBtn.click();

    // close the popup
    deliveryPopUp.closePopUp();

    flash.showMessage({value:'Delivery assigned successfully', type: 'success'});

    // console.log(result);

}

// get filter Options and sort Options
const filterOptions = document.getElementById('filterOptions');
const sortOptions = document.getElementById('sortOptions');

// add event listener to filter and sort buttons
document.getElementById('filter').addEventListener('click', function(e) {
    if(filterOptions.style.display === 'block') {
        filterOptions.style.display = 'none';
    } else {
        filterOptions.style.display = 'block';
    }
    sortOptions.style.display = 'none';
});

document.getElementById('sort').addEventListener('click', function(e) {
    if(sortOptions.style.display === 'block') {
        sortOptions.style.display = 'none';
    } else {
        sortOptions.style.display = 'block';
    }
    filterOptions.style.display = 'none';
});

filterOptions.addEventListener('click', function(e) {
    e.stopPropagation();
});

sortOptions.addEventListener('click', function(e) {
    e.stopPropagation();
});

// get the divs to show the deliveries
const pendingDeliveryDiv = document.getElementById('pendingDeliveryDiv');
const completedDeliveryDiv = document.getElementById('completedDeliveryDiv');

// get filter and sort btns
const filterBtn = document.getElementById('filterBtn');
const sortBtn = document.getElementById('sortBtn');

// filter options => by item
const item = document.getElementById('filterCategory');
const process = document.getElementById('filterProcess');

// sort options => by created date, amount
const createdDate = document.getElementById('sortCreatedDate');

// add event listener to filter and sort buttons
filterBtn.addEventListener('click', async function(e) {

    // get the filter values
    let filters = {};

    if(item.value) {
        filters['item'] = item.value;
    }

    // get the sort values
    let sort = {DES:[]};

    if(createdDate.checked) {
        sort['DES'].push('createdDate');
    }

    // get what processes to show
    const processValue = process.value;

    // get the deliveries from the backend
    const result = await getData('./deliveries/filter', 'POST', { filters:filters, sort:sort, process:processValue });

    // console.log(result);

    // if error occurs, show error message
    if(!result['status']) {
        flash.showMessage({value: result['message'], type: 'error'});
        return;
    }

    toggle.removeNoData();

    // get the data from the response
    // first get the deliveries
    const directDonations = result['directDonations'];
    const acceptedRequests = result['acceptedRequests'];
    const ccDonations = result['ccDonations'];

    // filter out pending deliveries
    const pendingDirectDonations = directDonations ? directDonations.filter(delivery => delivery['status'] !== 'Completed') : [];
    const pendingAcceptedRequests = acceptedRequests ? acceptedRequests.filter(delivery => delivery['deliveryStatus'] !== 'Completed') : [];
    const pendingCCDonations = ccDonations ? ccDonations.filter(delivery => delivery['status'] !== 'Completed') : [];

    // filter out completed deliveries
    const completedDirectDonations = directDonations ? directDonations.filter(delivery => delivery['status'] === 'Completed') : [];
    const completedAcceptedRequests = acceptedRequests ? acceptedRequests.filter(delivery => delivery['deliveryStatus'] === 'Completed') : [];
    const completedCCDonations = ccDonations ? ccDonations.filter(delivery => delivery['status'] === 'Completed') : [];


    // get the destinations and subcategories
    const destinations = result['destinations'];
    const subcategories = result['subcategories'];

    // initialize the delivery card class
    const deliveries = new DeliveryCardLogistic(destinations, subcategories);

    // remove currently shown delivery cards
    pendingDeliveryDiv.innerHTML = '';
    completedDeliveryDiv.innerHTML = '';

    // if delivery related to direct donations are available show them
    if(directDonations) {
        deliveries.showDeliveryCards(pendingDeliveryDiv,pendingDirectDonations,'directDonations');
        deliveries.showDeliveryCards(completedDeliveryDiv,completedDirectDonations,'directDonations');
    }

    // if delivery related to accepted requests are available show them
    if(acceptedRequests) {
        deliveries.showDeliveryCards(pendingDeliveryDiv,pendingAcceptedRequests,'acceptedRequests');
        deliveries.showDeliveryCards(completedDeliveryDiv,completedAcceptedRequests,'acceptedRequests');
    }

    // if delivery related to cc donations are available show them
    if(ccDonations) {
        deliveries.showDeliveryCards(pendingDeliveryDiv,pendingCCDonations,'ccDonations');
        deliveries.showDeliveryCards(completedDeliveryDiv,completedCCDonations,'ccDonations');
    }

    toggle.checkNoData();

    // hide the filter and sort options
    filterOptions.style.display = 'none';
    sortOptions.style.display = 'none';

    // add event listener to the delivery cards
    updateDeliveryCardsOnclickFunctions();

});

// add event listener to sort button
sortBtn.addEventListener('click', async function(e) {
   filterBtn.click();
});